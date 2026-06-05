// 부가서비스 백필 — 가격 sync(sync-opinet) "이후" 남는 Opinet 일일 한도 안에서
// 부가서비스(세차/편의점/경정비/품질인증/LPG겸업)가 아직 미보강(amenities_updated_at IS NULL)인
// 주유소를 limit 건씩 detailById.do(1건당 1콜)로 채워 며칠에 걸쳐 전체를 완성한다.
//
// 왜 별도 라우트인가:
//   sync-opinet 도 말미에 회전 보강(AMENITY_REFRESH_BUDGET)을 하지만, 그건 가격 sync 와 같은
//   호출 예산을 공유한다. 이 라우트는 sync-opinet 직후(예: 00:30) 작은 배치로 따로 돌려
//   "가격은 있는데 부가서비스만 비어 있는(null)" 주유소를 명시적으로 소진한다.
//   (상세보기의 가격-fallback 캐시는 가격이 전무한 주유소만 채우므로, 가격이 있는 채로
//    부가서비스만 null 인 주유소는 그 경로로는 영영 안 채워진다 — 이 라우트가 그 공백을 메운다.)
//
// 보호: Authorization: Bearer ${CRON_SECRET}.
// graceful skip: USE_MOCK / Supabase 미설정 / OPINET_API_KEY 미설정 시 skip.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// detailById 는 1건당 1콜이라 limit(기본 100) 건이면 동시성 제한(CONCURRENCY) 하에서
// 수십 초 걸릴 수 있다. sync-opinet 과 동일하게 넉넉히 둔다.
export const maxDuration = 300;

const OPINET_BASE = 'https://www.opinet.co.kr/api';

// 1회 처리(=Opinet 호출) 기본 상한. Opinet 일일 한도(1,500)와 가격 sync(~1,020콜) 소진을
// 감안해 보수적으로 둔다. ?limit=N 으로 조정하되 아래 MAX 로 캡한다.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

// sync-opinet 과 동일한 동시성/완충 패턴 — Promise.all 폭주 시 Opinet 이 빈 응답을 주므로 풀로 묶는다.
const CONCURRENCY = 6;
const REQUEST_DELAY_MS = 60;
// 연속 빈/실패 응답이 이만큼 누적되면 할당량 소진으로 보고 그 회차를 조기 중단(호출 낭비 방지).
const ABORT_AFTER_CONSECUTIVE_EMPTY = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 동시 실행 수를 limit개로 제한하는 워커 풀(sync-opinet 과 동일 패턴, 외부 의존 없음).
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

// detailById.do(id) → 주유소 1건 상세(부가서비스 포함).
interface OpinetDetailOil {
  UNI_ID?: string;
  OS_NM?: string;
  CAR_WASH_YN?: string;
  CVS_YN?: string;
  MAINT_YN?: string;
  KPETRO_YN?: string;
  LPG_YN?: string;
}
async function opinetDetailById(id: string): Promise<OpinetDetailOil | null> {
  const key = process.env.OPINET_API_KEY;
  if (!key) throw new Error('OPINET_API_KEY missing');
  const url = `${OPINET_BASE}/detailById.do?out=json&code=${key}&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`opinet ${res.status}`);
  const data = await res.json();
  return (data?.RESULT?.OIL?.[0] as OpinetDetailOil | undefined) ?? null;
}

// Opinet 할당량 소진/일시오류 시 HTTP 200 + RESULT.OIL=[] (빈 배열)을 준다 → opinetDetailById 가 null.
// OIL[0] 이 있어도 식별 필드(UNI_ID/OS_NM)가 비면 신뢰할 수 없는 응답으로 본다.
function isValidDetail(d: OpinetDetailOil | null): d is OpinetDetailOil {
  if (!d) return false;
  const hasId = String(d.UNI_ID ?? '').trim().length > 0;
  const hasName = String(d.OS_NM ?? '').trim().length > 0;
  return hasId && hasName;
}

const isY = (v?: string) => String(v ?? '').trim().toUpperCase() === 'Y';
// LPG_YN 은 업종구분(N:주유소, Y:충전소, C:겸업) — Y/C 면 LPG 취급으로 본다.
const hasLpgFrom = (v?: string) => {
  const t = String(v ?? '').trim().toUpperCase();
  return t === 'Y' || t === 'C';
};

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured() || !process.env.OPINET_API_KEY) {
    return NextResponse.json({ skipped: true, reason: 'mock mode or missing config' });
  }

  // ?limit=N — 1회 detailById 호출 상한. 기본 보수값, MAX 로 캡.
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const sb = getSupabase();
  const now = new Date().toISOString();
  const fetchErrors: string[] = [];
  let opinetCalls = 0;

  // ─── 0) 고속도로(EXP) 주유소는 Opinet 에 없다 → detailById 호출 없이 보강시각만 마킹해 영구 제외 ───
  // 이 마킹이 없으면 미보강(null) 카운트에 영구히 남아 "남은 0" 도달을 막는다(호출은 0건).
  let highwayMarked = 0;
  {
    const { data: marked, error } = await sb
      .from('stations')
      .update({ amenities_updated_at: now })
      .is('amenities_updated_at', null)
      .or('is_highway.eq.true,brand_code.eq.EXP')
      .select('id');
    if (error) fetchErrors.push(`highway mark: ${error.message}`);
    else highwayMarked = marked?.length ?? 0;
  }

  // ─── 1) 보강 대상 선정 — 미보강(null) + 고속도로 제외, 오래된 것부터(여기선 전부 null) ───
  // 고속도로는 위에서 모두 마킹돼 빠지지만, 같은 run 내 동시성 안전을 위해 조회에서도 한 번 더 배제한다.
  const { data: targets, error: tErr } = await sb
    .from('stations')
    .select('id')
    .is('amenities_updated_at', null)
    .neq('brand_code', 'EXP')
    .or('is_highway.is.null,is_highway.eq.false')
    .order('id', { ascending: true })
    .limit(limit);
  if (tErr) {
    return NextResponse.json({ error: `target query failed: ${tErr.message}` }, { status: 500 });
  }

  const ids = (targets ?? []).map((t) => t.id as string);

  // ─── 2) 각 대상 detailById 1회 → 부가서비스 UPDATE + amenities_updated_at=now ───
  // 정책:
  //   - 정상 응답: 부가서비스 5종 + amenities_updated_at 기록(모두 N 이어도 정상 결과로 마킹).
  //   - 빈/실패 응답: amenities_updated_at 미갱신 → 다음 회차 재시도(영구 오염 방지).
  //   - 연속 빈/실패 ABORT_AFTER_CONSECUTIVE_EMPTY 회 → 할당량 소진 의심, 그 회차 조기 중단.
  let refreshed = 0;
  let failed = 0;
  let skipped = 0;
  let aborted = false;
  let consecutiveEmpty = 0;

  await mapWithConcurrency(ids, CONCURRENCY, async (id) => {
    if (aborted) return; // 조기 중단 후 잔여 작업은 호출하지 않음(콜 절약)
    opinetCalls++;

    let d: OpinetDetailOil | null = null;
    try {
      d = await opinetDetailById(id);
    } catch (e) {
      failed++;
      consecutiveEmpty++;
      fetchErrors.push(`detail ${id}: ${(e as Error).message}`);
      if (consecutiveEmpty >= ABORT_AFTER_CONSECUTIVE_EMPTY) aborted = true;
      await sleep(REQUEST_DELAY_MS);
      return;
    }

    if (!isValidDetail(d)) {
      // 할당량 소진/일시오류로 빈 응답 → 보강시각 미갱신(다음 회차 재시도).
      skipped++;
      consecutiveEmpty++;
      if (consecutiveEmpty >= ABORT_AFTER_CONSECUTIVE_EMPTY) {
        aborted = true;
        fetchErrors.push(
          `backfill aborted: ${consecutiveEmpty} consecutive empty responses (likely Opinet quota exhausted)`,
        );
      }
      await sleep(REQUEST_DELAY_MS);
      return;
    }

    consecutiveEmpty = 0;
    // 기존 stations 행의 부가서비스 컬럼만 UPDATE(NOT NULL 컬럼 미관여 — upsert 금지, sync-opinet 과 동일 이유).
    const { error: uErr } = await sb
      .from('stations')
      .update({
        has_carwash: isY(d.CAR_WASH_YN),
        has_cvs: isY(d.CVS_YN),
        has_maintenance: isY(d.MAINT_YN),
        is_kpetro: isY(d.KPETRO_YN),
        has_lpg: hasLpgFrom(d.LPG_YN),
        amenities_updated_at: now,
      })
      .eq('id', id);
    if (uErr) {
      failed++;
      fetchErrors.push(`update ${id}: ${uErr.message}`);
    } else {
      refreshed++;
    }
    await sleep(REQUEST_DELAY_MS);
  });

  // ─── 3) 남은 미보강(null) 카운트 — 운영 가시성("남은 0" 도달 추적) ───
  let remaining: number | null = null;
  {
    const { count, error } = await sb
      .from('stations')
      .select('*', { count: 'exact', head: true })
      .is('amenities_updated_at', null);
    if (error) fetchErrors.push(`remaining count: ${error.message}`);
    else remaining = count ?? 0;
  }

  return NextResponse.json({
    ok: true,
    asOf: now,
    limit,
    highwayMarked,         // 이번 run 에 고속도로(EXP)로 마킹해 영구 제외한 수(호출 0건)
    attempted: ids.length, // detailById 시도 대상 수(aborted 시 일부만 실제 호출)
    opinetCalls,           // 실제 Opinet 호출 누적(일일 한도 모니터링용)
    refreshed,             // 정상 보강 성공
    failed,                // 호출/업데이트 실패(보강시각 미갱신, 재시도 대상)
    skipped,               // 빈 응답으로 건너뜀(보강시각 미갱신, 재시도 대상)
    aborted,               // 연속 빈 응답으로 조기 중단했는지
    remaining,             // 잔여 미보강(amenities_updated_at IS NULL) 수
    fetchErrors: fetchErrors.length ? fetchErrors : undefined,
  });
}
