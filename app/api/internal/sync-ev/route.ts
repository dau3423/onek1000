// Cron (1일 1회, 04:30) — 전기차 충전소 정적정보 + 상태 보강 (data.go.kr EvCharger /getChargerInfo)
// Authorization: Bearer ${CRON_SECRET}
// USE_MOCK=true 거나 Supabase 미설정 / EV_CHARGER_API_KEY 미설정인 경우 skip.
//
// 설계 요지(Cloud Run 300s 요청 제한에 견고하게):
//  - 전국 17개 시도를 한 번의 HTTP 요청으로 처리하면 300s 안에 불가능(서울만 7만+건) → 시간예산 내 순회.
//  - 페이지 단위 즉시 upsert: 한 페이지 받을 때마다 바로 upsert해서 중간에 죽어도 받은 만큼 DB에 남는다.
//  - 시간예산(약 250초) 초과 시 더 진행하지 않고 진행 상황 + 다음 이어받을 위치(resumeFrom)를 응답에 담아 정상 반환.
//  - resume: 전국 모드는 zcode별 마지막 synced_at이 가장 오래된(또는 없는) 시도부터 처리 → 여러 호출/며칠에 걸쳐 한 바퀴.
//  - stale 정리는 "그 zcode를 완전히 다 받은 경우에만" 수행(부분 수신 zcode는 과삭제 가드로 건너뜀).
//  - ?zcode=11 이면 그 시도 하나만 빠르게 sync(수동/지역별 적재용).

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import {
  EV_ZCODES,
  evGetChargerInfo,
  evNorm,
  evYn,
  evDateToIso,
  type EvChargerInfoItem,
} from '@/lib/ev/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Cloud Run 요청 제한과 동일선상. 단, 실제 작업은 아래 TIME_BUDGET_MS로 자체 종료한다.
export const maxDuration = 300;

// 한 페이지 최대 행. 과거 9999는 페이로드가 너무 크고 느려(서울 8페이지 수백 초) 타임아웃을 유발했다.
// 1500으로 낮춰 페이지당 응답을 빠르게 한다(총 페이지 수는 늘지만 각 호출이 빠르고 메모리/타임아웃에 안전).
const NUM_OF_ROWS = 1500;
// 시도별 최대 페이지 수(폭주 가드). 1500×60 = 9만 행/시도까지 커버(서울 7.5만 기준 충분).
const MAX_PAGES = 60;
// 단일 upsert payload 가드 — 페이지(1500행)를 그대로 쓰되 만약을 위해 청크 상한.
const UPSERT_CHUNK = 1500;
// zcode별 호출 사이 짧은 지연(throttle 회피).
const REQUEST_DELAY_MS = 80;
// 페이지 호출 타임아웃(504 대비) + 재시도 횟수.
const PAGE_TIMEOUT_MS = 20_000;
const MAX_RETRY = 2;
// 단일 요청 시간예산. 이 시간이 지나면 진행 중인 zcode를 끝낸 뒤 더 시작하지 않는다(maxDuration 여유 50s).
const TIME_BUDGET_MS = 250_000;
// data.go.kr 일일 한도 가드 — 한 호출이 부를 수 있는 총 API 호출 상한.
const MAX_API_CALLS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface EvRow {
  stat_id: string;
  chger_id: string;
  stat_nm: string;
  addr: string | null;
  addr_detail: string | null;
  lat: number;
  lng: number;
  geom: string;
  chger_type: string | null;
  output_kw: number | null;
  use_time: string | null;
  method: string | null;
  busi_id: string | null;
  busi_nm: string | null;
  busi_call: string | null;
  stat: string | null;
  stat_upd_dt: string | null;
  kind: string | null;
  kind_detail: string | null;
  zcode: string | null;
  zscode: string | null;
  parking_free: boolean | null;
  limit_yn: boolean | null;
  del_yn: boolean;
  output_raw: string | null;
  synced_at: string;
}

/** getChargerInfo item → ev_chargers 행. 좌표/필수값 누락이면 null(skip). */
function toRow(it: EvChargerInfoItem, now: string): EvRow | null {
  const statId = evNorm(it.statId);
  const chgerId = evNorm(it.chgerId);
  if (!statId || !chgerId) return null;

  const lat = Number(evNorm(it.lat));
  const lng = Number(evNorm(it.lng));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;

  const outRaw = evNorm(it.output);
  const outNum = outRaw != null ? Number(outRaw) : NaN;

  return {
    stat_id: statId,
    chger_id: chgerId,
    stat_nm: evNorm(it.statNm) ?? statId,
    addr: evNorm(it.addr),
    addr_detail: evNorm(it.addrDetail),
    lat,
    lng,
    geom: `SRID=4326;POINT(${lng} ${lat})`,
    chger_type: evNorm(it.chgerType),
    output_kw: Number.isFinite(outNum) ? Math.round(outNum) : null,
    use_time: evNorm(it.useTime),
    method: evNorm(it.method),
    busi_id: evNorm(it.busiId),
    busi_nm: evNorm(it.busiNm),
    busi_call: evNorm(it.busiCall),
    stat: evNorm(it.stat),
    stat_upd_dt: evDateToIso(it.statUpdDt),
    kind: evNorm(it.kind),
    kind_detail: evNorm(it.kindDetail),
    zcode: evNorm(it.zcode),
    zscode: evNorm(it.zscode),
    parking_free: evYn(it.parkingFree),
    limit_yn: evYn(it.limitYn),
    del_yn: evYn(it.delYn) ?? false,
    output_raw: outRaw,
    synced_at: now,
  };
}

async function upsertInChunks(
  sb: ReturnType<typeof getSupabase>,
  rows: EvRow[],
  label: string,
) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from('ev_chargers').upsert(chunk, { onConflict: 'stat_id,chger_id' });
    if (error) throw new Error(`${label} failed (rows ${i}-${i + chunk.length}): ${error.message}`);
  }
}

/** 타임아웃/일시 오류 재시도 래퍼. */
async function fetchPageWithRetry(zcode: string, pageNo: number) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      return await evGetChargerInfo({ zcode, pageNo, numOfRows: NUM_OF_ROWS, timeoutMs: PAGE_TIMEOUT_MS });
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('ev fetch failed');
}

interface ZoneResult {
  upserts: number;
  skipped: number;
  apiCalls: number;
  complete: boolean; // 이 zcode의 모든 페이지를 다 받았는가(stale 정리 자격)
}

/**
 * 한 시도(zcode)를 페이지 단위로 즉시 upsert. 시간예산/호출상한을 넘기 직전이면 중단(complete=false).
 * @returns 적재 결과. complete=true 면 모든 페이지 수신 완료 → stale 정리 대상.
 */
async function syncZone(
  sb: ReturnType<typeof getSupabase>,
  zcode: string,
  now: string,
  budget: { startedAt: number; apiCallsUsed: number },
): Promise<ZoneResult> {
  let upserts = 0;
  let skipped = 0;
  let apiCalls = 0;

  // 1페이지로 totalCount 파악 + 즉시 upsert.
  const first = await fetchPageWithRetry(zcode, 1);
  apiCalls++;
  const firstRows: EvRow[] = [];
  for (const it of first.items) {
    const r = toRow(it, now);
    if (r) firstRows.push(r); else skipped++;
  }
  await upsertInChunks(sb, firstRows, `ev upsert z${zcode} p1`);
  upserts += firstRows.length;

  const total = first.totalCount;
  const pages = Math.min(MAX_PAGES, Math.ceil(total / NUM_OF_ROWS) || 1);

  for (let pageNo = 2; pageNo <= pages; pageNo++) {
    // 다음 페이지 시작 전 예산 체크 — 넘으면 이 zcode는 부분 수신으로 종료(stale 정리 제외).
    const elapsed = Date.now() - budget.startedAt;
    if (elapsed > TIME_BUDGET_MS || budget.apiCallsUsed + apiCalls >= MAX_API_CALLS) {
      return { upserts, skipped, apiCalls, complete: false };
    }
    await sleep(REQUEST_DELAY_MS);
    const page = await fetchPageWithRetry(zcode, pageNo);
    apiCalls++;
    const rows: EvRow[] = [];
    for (const it of page.items) {
      const r = toRow(it, now);
      if (r) rows.push(r); else skipped++;
    }
    await upsertInChunks(sb, rows, `ev upsert z${zcode} p${pageNo}`);
    upserts += rows.length;
  }

  return { upserts, skipped, apiCalls, complete: true };
}

/**
 * 전국 모드 처리 순서 결정: zcode별 마지막 synced_at이 가장 오래된(또는 한 번도 안 한) 시도부터.
 * 여러 호출/며칠에 걸쳐 자연스럽게 한 바퀴를 돌게 한다(resume).
 */
async function orderZcodesByStaleness(sb: ReturnType<typeof getSupabase>): Promise<string[]> {
  try {
    const { data, error } = await sb.rpc('rpc_ev_zcode_synced_at');
    if (!error && Array.isArray(data)) {
      const lastByZ = new Map<string, number>();
      for (const row of data as Array<{ zcode: string | null; last_synced_at: string | null }>) {
        if (row.zcode) lastByZ.set(row.zcode, row.last_synced_at ? Date.parse(row.last_synced_at) : 0);
      }
      return [...EV_ZCODES].sort((a, b) => (lastByZ.get(a) ?? 0) - (lastByZ.get(b) ?? 0));
    }
  } catch {
    // RPC 미존재 등 → 폴백.
  }
  // 폴백: RPC가 없으면 zcode별 max(synced_at)를 가벼운 쿼리로 추정(상위 1건씩).
  const lastByZ = new Map<string, number>();
  for (const z of EV_ZCODES) {
    try {
      const { data } = await sb
        .from('ev_chargers')
        .select('synced_at')
        .eq('zcode', z)
        .order('synced_at', { ascending: false })
        .limit(1);
      const ts = data?.[0]?.synced_at ? Date.parse(data[0].synced_at as string) : 0;
      lastByZ.set(z, ts);
    } catch {
      lastByZ.set(z, 0);
    }
  }
  return [...EV_ZCODES].sort((a, b) => (lastByZ.get(a) ?? 0) - (lastByZ.get(b) ?? 0));
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured() || !process.env.EV_CHARGER_API_KEY) {
    return NextResponse.json({ skipped: true, reason: 'mock mode or missing config' });
  }

  const sb = getSupabase();
  const now = new Date().toISOString();
  const startedAt = Date.now();
  const fetchErrors: string[] = [];

  let totalUpserts = 0;
  let totalSkipped = 0;
  let apiCalls = 0;
  let staleDeleted = 0;
  const okZcodes: string[] = [];   // 완전 수신 + 적재된 시도(stale 정리 대상)
  let resumeFrom: string | null = null; // 시간/호출 예산으로 다 못 돈 경우 다음에 이어서 할 첫 zcode

  // ?zcode=11 단일 시도 모드.
  const url = new URL(req.url);
  const single = url.searchParams.get('zcode')?.trim() || null;
  if (single && !(EV_ZCODES as readonly string[]).includes(single)) {
    return NextResponse.json({ error: `invalid zcode: ${single}`, validZcodes: EV_ZCODES }, { status: 400 });
  }

  // 처리 대상 zcode 순서: 단일이면 그것만, 전국이면 오래된 순.
  const targets = single ? [single] : await orderZcodesByStaleness(sb);

  for (let i = 0; i < targets.length; i++) {
    const zcode = targets[i];

    // 시도 시작 전 예산 체크 — 넘으면 남은 시도는 다음 호출로 미룬다(resume).
    const elapsed = Date.now() - startedAt;
    if (!single && (elapsed > TIME_BUDGET_MS || apiCalls >= MAX_API_CALLS)) {
      resumeFrom = zcode;
      break;
    }

    try {
      const r = await syncZone(sb, zcode, now, { startedAt, apiCallsUsed: apiCalls });
      apiCalls += r.apiCalls;
      totalUpserts += r.upserts;
      totalSkipped += r.skipped;

      if (r.complete && r.upserts > 0) {
        // 이 zcode를 완전히 다 받았고 적재가 있었음 → stale 정리 자격.
        okZcodes.push(zcode);
      } else if (!r.complete) {
        // 예산으로 중단 → 이 zcode부터 다음 호출에서 다시(부분만 받았으므로 stale 정리 금지).
        resumeFrom = zcode;
        break;
      }
      await sleep(REQUEST_DELAY_MS);
    } catch (e) {
      // 이 시도는 실패 → stale 정리에서 제외(과삭제 가드). 사유 기록.
      fetchErrors.push(`z${zcode}: ${(e as Error).message}`);
    }
  }

  // ─── stale 정리 ───
  // 완전 수신된 시도(okZcodes)에 한해, 이번 run에서 보고되지 않은(synced_at < now) 행을 제거한다.
  // 부분 수신/실패 시도는 건너뛰어(과삭제 가드) 그 지역 데이터가 통째로 비는 사고를 막는다.
  if (okZcodes.length > 0) {
    try {
      const { data: deleted, error } = await sb
        .from('ev_chargers')
        .delete()
        .in('zcode', okZcodes)
        .lt('synced_at', now)
        .select('stat_id');
      if (error) fetchErrors.push(`stale cleanup failed: ${error.message}`);
      else staleDeleted = deleted?.length ?? 0;
    } catch (e) {
      fetchErrors.push(`stale cleanup: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    asOf: now,
    mode: single ? `single(z${single})` : 'nationwide',
    zcodes: targets.length,
    okZcodes,                 // 이번 호출에서 완전 수신·정리까지 끝난 시도 목록
    okZcodesCount: okZcodes.length,
    apiCalls,
    totalUpserts,
    totalSkipped,
    staleDeleted,
    elapsedMs: Date.now() - startedAt,
    resumeFrom,               // null이면 한 바퀴 완료. 값이 있으면 다음 호출이 이어받을 첫 zcode.
    fetchErrors: fetchErrors.length ? fetchErrors : undefined,
  });
}
