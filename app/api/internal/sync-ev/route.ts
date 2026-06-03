// Cron (1일 1회) — 전기차 충전소 정적정보 + 상태 보강 (data.go.kr EvCharger /getChargerInfo)
// Authorization: Bearer ${CRON_SECRET}
// USE_MOCK=true 거나 Supabase 미설정 / EV_CHARGER_API_KEY 미설정인 경우 skip.
//
// 설계 요지(sync-opinet 패턴 미러링):
//  - zcode(시도 17개) 없이 전국 호출하면 504 타임아웃 → 반드시 시도별 페이지네이션.
//  - 시도별로 numOfRows 큰 값으로 totalCount까지 페이지 순회 → upsert(stat_id, chger_id).
//  - data.go.kr 일일 한도 고려해 호출 수(apiCalls) 로깅, 타임아웃 대비 zcode별 호출 + 재시도.
//  - 이번 run에 보고되지 않은 시도의 행은 stale 정리(과삭제 가드: 시도 실패 시 그 시도는 건너뜀).

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
// 전국 수십만 건(서울만 75,036). 시도 17개 × 페이지 수 × upsert로 분 단위가 걸릴 수 있어 충분히 상향.
export const maxDuration = 300;

// 한 페이지 최대 행. data.go.kr 최대 9999. 504 회피 위해 시도별 호출은 유지하되 페이지는 크게.
const NUM_OF_ROWS = 9999;
// 시도별 최대 페이지 수(폭주 가드). 9999×40 = ~40만 행까지 커버.
const MAX_PAGES = 40;
// 단일 upsert payload 가드 — 행이 많아 청크 분할.
const UPSERT_CHUNK = 1000;
// zcode별 호출 사이 짧은 지연(throttle 회피).
const REQUEST_DELAY_MS = 80;
// 페이지 호출 타임아웃(504 대비) + 재시도 횟수.
const PAGE_TIMEOUT_MS = 30_000;
const MAX_RETRY = 2;

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

async function inChunks<T>(
  rows: T[],
  size: number,
  fn: (chunk: T[]) => Promise<{ error: { message: string } | null }>,
  label: string,
) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await fn(chunk);
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
  const fetchErrors: string[] = [];
  let apiCalls = 0;

  let totalUpserts = 0;
  let totalSkipped = 0;
  const okZcodes: string[] = []; // 정상 적재된 시도(stale 정리 대상)
  let staleDeleted = 0;

  // 시도별 순차 처리(504 회피 위해 동시 폭주 금지). 시도 내부는 페이지네이션.
  for (const zcode of EV_ZCODES) {
    try {
      // 1페이지로 totalCount 파악 후 필요한 만큼 순회.
      let pageNo = 1;
      const zRows = new Map<string, EvRow>(); // 시도 내 (stat_id|chger_id) dedupe
      const first = await fetchPageWithRetry(zcode, pageNo);
      apiCalls++;
      for (const it of first.items) {
        const r = toRow(it, now);
        if (r) zRows.set(`${r.stat_id}|${r.chger_id}`, r); else totalSkipped++;
      }
      const total = first.totalCount;
      const pages = Math.min(MAX_PAGES, Math.ceil(total / NUM_OF_ROWS) || 1);
      for (pageNo = 2; pageNo <= pages; pageNo++) {
        await sleep(REQUEST_DELAY_MS);
        const page = await fetchPageWithRetry(zcode, pageNo);
        apiCalls++;
        for (const it of page.items) {
          const r = toRow(it, now);
          if (r) zRows.set(`${r.stat_id}|${r.chger_id}`, r); else totalSkipped++;
        }
      }

      const rows = [...zRows.values()];
      // upsert(stat_id, chger_id) — 정적정보+상태 갱신. 청크 분할로 payload/타임아웃 가드.
      await inChunks(rows, UPSERT_CHUNK,
        async (chunk) => await sb.from('ev_chargers').upsert(chunk, { onConflict: 'stat_id,chger_id' }),
        `ev upsert z${zcode}`);
      totalUpserts += rows.length;
      okZcodes.push(zcode);
      await sleep(REQUEST_DELAY_MS);
    } catch (e) {
      // 이 시도는 실패 → stale 정리에서 제외(과삭제 가드).
      fetchErrors.push(`z${zcode}: ${(e as Error).message}`);
    }
  }

  // ─── stale 정리 ───
  // 정상 적재된 시도(okZcodes)에 한해, 이번 run에서 보고되지 않은(synced_at < now) 행을 제거한다.
  // 실패한 시도는 건너뛰어(과삭제 가드) 그 지역 데이터가 통째로 비는 사고를 막는다.
  if (okZcodes.length > 0 && totalUpserts > 0) {
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
    zcodes: EV_ZCODES.length,
    okZcodes: okZcodes.length,
    apiCalls,
    totalUpserts,
    totalSkipped,
    staleDeleted,
    fetchErrors: fetchErrors.length ? fetchErrors : undefined,
  });
}
