// Cron (1일 1회, 04:30) — 전기차 충전소 정적정보 + 상태 보강 (data.go.kr EvCharger /getChargerInfo)
// Authorization: Bearer ${CRON_SECRET}
// USE_MOCK=true 거나 Supabase 미설정 / EV_CHARGER_API_KEY 미설정인 경우 skip.
//
// 설계 요지(Cloud Run 300s 요청 제한에 견고하게):
//  - 전국 17개 시도를 한 번의 HTTP 요청으로 처리하면 300s 안에 불가능(서울만 7만+건) → 시간예산 내 순회.
//  - 페이지 단위 즉시 upsert: 한 페이지 받을 때마다 바로 upsert해서 중간에 죽어도 받은 만큼 DB에 남는다.
//  - 시간예산(약 220초) 초과 시 더 진행하지 않고 진행 상황 + 다음 이어받을 위치(resumeFrom)를 응답에 담아 정상 반환.
//
//  - 페이지 커서 resume(ev_sync_state): zcode별 "다음에 받을 페이지(next_page)"를 영속화한다.
//    페이지당 16~19초라 대형 시도(서울 51페이지)는 한 호출에 안 끝난다. 매 페이지 upsert 직후 next_page를
//    저장하므로, 다음 호출은 "멈춘 페이지부터" 이어받아 결국 전 페이지를 적재한다.
//  - zcode 선정 순서: 진행 중(next_page>1, cycle 미완)인 zcode 우선 → 그다음 cycle이 오래된/완료된 zcode.
//  - cycle 완료 판정: next_page > ceil(total_count / NUM_OF_ROWS)(마지막 페이지까지 받음).
//    완료된 zcode에 한해서만 stale 정리(이번 cycle 하한 미만 synced_at 삭제) 후 커서를 page1로 리셋.
//    부분/미완 zcode는 stale 정리 절대 금지(과거 Opinet 부분 sync 과삭제 사고 교훈).
//  - 커서 테이블 미적용 환경 폴백: 커서 없이 기존 동작(zcode 오래된 순, 시도 내부는 page1부터).
//    이 경우 대형 시도는 미완일 수 있으므로 마이그레이션(0016) 적용을 권장한다.
//  - ?zcode=11 이면 그 시도 하나만 sync(수동/지역별 적재용). 커서 이어받기 동일 적용.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { EV_ZCODES, evGetChargerInfo } from '@/lib/ev/client';
import { toRow, type EvRow } from '@/lib/ev/row';

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
// 페이지 호출 타임아웃 — data.go.kr이 numOfRows=1500에서 페이지당 16~19초(실측), 서버는 더 느려
// 30초로는 abort가 났다. 60초로 상향. (시간예산 로직이 페이지 시작 전 elapsed를 보므로
// 한 페이지가 60초까지 늘어나도 TIME_BUDGET_MS 초과분은 maxDuration 여유 50s 안에서 흡수된다.)
const PAGE_TIMEOUT_MS = 60_000;
const MAX_RETRY = 2;
// 단일 요청 시간예산. 페이지/시도 "시작 전" elapsed로만 체크하므로, 예산 통과 직후 시작한 마지막
// 페이지가 최악 PAGE_TIMEOUT_MS(60s) + 재시도/지연 + upsert까지 더 걸릴 수 있다.
// maxDuration 300s 안에 그 최악 페이지를 흡수하도록 예산을 220s로 둔다(여유 ~80s).
const TIME_BUDGET_MS = 220_000;
// data.go.kr 일일 한도 가드 — 한 호출이 부를 수 있는 총 API 호출 상한.
const MAX_API_CALLS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// ─── 커서(ev_sync_state) 접근 — 테이블 미적용이면 조용히 폴백 ───

interface CursorRow {
  zcode: string;
  next_page: number;
  total_count: number | null;
  cycle_started_at: string | null;
}

/** ev_sync_state 전체를 zcode→커서로 로드. 테이블이 없으면 null(폴백 신호). */
async function loadCursors(
  sb: ReturnType<typeof getSupabase>,
): Promise<Map<string, CursorRow> | null> {
  try {
    const { data, error } = await sb
      .from('ev_sync_state')
      .select('zcode, next_page, total_count, cycle_started_at');
    if (error) return null; // 테이블 없음(42P01) 등 → 폴백
    const m = new Map<string, CursorRow>();
    for (const r of (data ?? []) as CursorRow[]) m.set(r.zcode, r);
    return m;
  } catch {
    return null;
  }
}

/** 커서 upsert(페이지마다 호출). 테이블 미적용이면 조용히 무시. */
async function saveCursor(
  sb: ReturnType<typeof getSupabase>,
  cursorsAvailable: boolean,
  row: { zcode: string; next_page: number; total_count?: number | null; cycle_started_at?: string | null },
): Promise<void> {
  if (!cursorsAvailable) return;
  const payload: Record<string, unknown> = {
    zcode: row.zcode,
    next_page: row.next_page,
    updated_at: new Date().toISOString(),
  };
  if (row.total_count !== undefined) payload.total_count = row.total_count;
  if (row.cycle_started_at !== undefined) payload.cycle_started_at = row.cycle_started_at;
  try {
    await sb.from('ev_sync_state').upsert(payload, { onConflict: 'zcode' });
  } catch {
    // 커서 저장 실패는 적재 자체를 막지 않는다(다음 호출이 page1부터일 뿐).
  }
}

interface ZoneResult {
  upserts: number;
  skipped: number;
  apiCalls: number;
  complete: boolean;     // 이 zcode의 모든 페이지를 이번 cycle에 다 받았는가(stale 정리 자격)
  startPage: number;     // 이번 호출에서 시작한 페이지(진단)
  lastPage: number;      // 이번 호출에서 마지막으로 받은 페이지(진단)
  totalCount: number;    // 마지막으로 확인한 totalCount
  cycleStartedAt: string; // 이 cycle의 synced_at 하한(stale 정리 기준)
}

/**
 * 한 시도(zcode)를 커서(next_page)부터 페이지 단위로 즉시 upsert.
 * 매 페이지 upsert 직후 next_page를 저장해, 중단돼도 다음 호출이 이어받는다.
 * 시간예산/호출상한을 넘기 직전이면 중단(complete=false). 마지막 페이지까지 받으면 complete=true.
 */
async function syncZone(
  sb: ReturnType<typeof getSupabase>,
  zcode: string,
  now: string,
  cursorsAvailable: boolean,
  cursor: CursorRow | undefined,
  budget: { startedAt: number; apiCallsUsed: number },
): Promise<ZoneResult> {
  let upserts = 0;
  let skipped = 0;
  let apiCalls = 0;

  // 커서가 있으면 그 페이지부터, 없으면 page1부터(폴백/새 cycle).
  const rawStart = cursor?.next_page ?? 1;
  const startPage = Number.isFinite(rawStart) && rawStart >= 1 ? rawStart : 1;
  // 이번 cycle의 synced_at 하한: 진행 중 cycle이면 그 시작 시각을 유지, 새 cycle(page1 시작)이면 now.
  const cycleStartedAt = startPage > 1 && cursor?.cycle_started_at ? cursor.cycle_started_at : now;

  let total = cursor?.total_count ?? 0;
  let lastPage = startPage - 1; // 아직 아무 페이지도 안 받음

  for (let pageNo = startPage; pageNo <= MAX_PAGES; pageNo++) {
    // 다음 페이지 시작 전 예산 체크 — 넘으면 이 zcode는 부분 수신으로 종료(stale 정리 제외).
    // 단 첫 페이지는 totalCount 파악을 위해 가능하면 한 번은 받는다(startPage가 곧 시작점).
    if (pageNo > startPage) {
      const elapsed = Date.now() - budget.startedAt;
      if (elapsed > TIME_BUDGET_MS || budget.apiCallsUsed + apiCalls >= MAX_API_CALLS) {
        // 중단: 다음 호출이 pageNo부터 이어받도록 커서 저장(이미 page-1까지 저장됨).
        return {
          upserts, skipped, apiCalls, complete: false,
          startPage, lastPage, totalCount: total, cycleStartedAt,
        };
      }
      await sleep(REQUEST_DELAY_MS);
    }

    const page = await fetchPageWithRetry(zcode, pageNo);
    apiCalls++;
    if (page.totalCount > 0) total = page.totalCount;

    const rows: EvRow[] = [];
    for (const it of page.items) {
      const r = toRow(it, now);
      if (r) rows.push(r); else skipped++;
    }
    await upsertInChunks(sb, rows, `ev upsert z${zcode} p${pageNo}`);
    upserts += rows.length;
    lastPage = pageNo;

    // 이 cycle의 마지막 페이지 수: totalCount 기반(폭주 가드 MAX_PAGES). 최소 1.
    const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / NUM_OF_ROWS) || 1));
    const isLastPage = pageNo >= pages;

    // 페이지 upsert 직후 커서 저장 — 중단돼도 다음 페이지부터 이어받게.
    // 마지막 페이지면 cycle 완료 → 호출부에서 stale 정리 후 page1로 리셋하므로 여기선 next_page만 갱신.
    await saveCursor(sb, cursorsAvailable, {
      zcode,
      next_page: isLastPage ? pages + 1 : pageNo + 1,
      total_count: total,
      cycle_started_at: cycleStartedAt,
    });

    if (isLastPage) {
      return {
        upserts, skipped, apiCalls, complete: true,
        startPage, lastPage, totalCount: total, cycleStartedAt,
      };
    }
  }

  // MAX_PAGES까지 다 돌았는데도 끝나지 않음(이론상 폭주 가드 도달) → 완료로 간주.
  return {
    upserts, skipped, apiCalls, complete: true,
    startPage, lastPage, totalCount: total, cycleStartedAt,
  };
}

/**
 * 전국 모드 처리 순서 결정.
 * 1순위: 진행 중(next_page>1, cycle 미완)인 zcode를 먼저(작은 zcode 순으로 안정적 결정) → 이어받기 우선.
 * 2순위: 그다음 cycle이 오래된/완료된 zcode(새 cycle 시작) — cycle_started_at(없으면 가장 오래됨)이 오래된 순.
 * 커서가 없으면(폴백) zcode별 마지막 synced_at이 오래된 순(기존 동작).
 */
async function orderZcodes(
  sb: ReturnType<typeof getSupabase>,
  cursors: Map<string, CursorRow> | null,
): Promise<string[]> {
  if (cursors) {
    const inProgress: string[] = [];
    const fresh: { z: string; ts: number }[] = [];
    for (const z of EV_ZCODES) {
      const c = cursors.get(z);
      if (c && c.next_page > 1) {
        inProgress.push(z);
      } else {
        const ts = c?.cycle_started_at ? Date.parse(c.cycle_started_at) : 0;
        fresh.push({ z, ts });
      }
    }
    inProgress.sort(); // 안정적 순서(작은 zcode 먼저)
    fresh.sort((a, b) => a.ts - b.ts || (a.z < b.z ? -1 : 1)); // 오래된 cycle 먼저
    return [...inProgress, ...fresh.map((f) => f.z)];
  }

  // ─── 폴백: 커서 테이블 없음 → 기존 staleness 기준 ───
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
    // RPC 미존재 등 → 아래 폴백.
  }
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
  const okZcodes: string[] = [];           // 이번 cycle 완료 + 적재된 시도(stale 정리 대상)
  let resumeFrom: string | null = null;    // 시간/호출 예산으로 다 못 돈 경우 다음에 이어서 할 첫 zcode
  // zcode별 진행 진단(next_page/total/완료여부).
  const progress: Array<{
    zcode: string; startPage: number; lastPage: number; nextPage: number;
    total: number; complete: boolean;
  }> = [];

  // ?zcode=11 단일 시도 모드.
  const url = new URL(req.url);
  const single = url.searchParams.get('zcode')?.trim() || null;
  if (single && !(EV_ZCODES as readonly string[]).includes(single)) {
    return NextResponse.json({ error: `invalid zcode: ${single}`, validZcodes: EV_ZCODES }, { status: 400 });
  }

  // 커서 로드(테이블 없으면 null → 폴백).
  const cursors = await loadCursors(sb);
  const cursorsAvailable = cursors !== null;

  // 처리 대상 zcode 순서: 단일이면 그것만, 전국이면 진행중 우선→오래된 cycle 순(폴백 시 staleness).
  const targets = single ? [single] : await orderZcodes(sb, cursors);

  for (let i = 0; i < targets.length; i++) {
    const zcode = targets[i];

    // 시도 시작 전 예산 체크 — 넘으면 남은 시도는 다음 호출로 미룬다(resume).
    const elapsed = Date.now() - startedAt;
    if (!single && (elapsed > TIME_BUDGET_MS || apiCalls >= MAX_API_CALLS)) {
      resumeFrom = zcode;
      break;
    }

    const cursor = cursors?.get(zcode);
    try {
      const r = await syncZone(sb, zcode, now, cursorsAvailable, cursor, { startedAt, apiCallsUsed: apiCalls });
      apiCalls += r.apiCalls;
      totalUpserts += r.upserts;
      totalSkipped += r.skipped;

      progress.push({
        zcode,
        startPage: r.startPage,
        lastPage: r.lastPage,
        nextPage: r.complete ? 1 : r.lastPage + 1,
        total: r.totalCount,
        complete: r.complete,
      });

      if (r.complete) {
        // 이번 cycle의 마지막 페이지까지 받음 → stale 정리 자격.
        // 이 cycle 하한(cycleStartedAt) 미만 synced_at 행을 이 zcode에서 제거.
        try {
          const { data: deleted, error } = await sb
            .from('ev_chargers')
            .delete()
            .eq('zcode', zcode)
            .lt('synced_at', r.cycleStartedAt)
            .select('stat_id');
          if (error) fetchErrors.push(`stale cleanup z${zcode} failed: ${error.message}`);
          else {
            staleDeleted += deleted?.length ?? 0;
            okZcodes.push(zcode);
          }
        } catch (e) {
          fetchErrors.push(`stale cleanup z${zcode}: ${(e as Error).message}`);
        }
        // cycle 완료 → 다음 한 바퀴 준비: 커서 page1로 리셋 + cycle_started_at 갱신.
        await saveCursor(sb, cursorsAvailable, {
          zcode,
          next_page: 1,
          total_count: r.totalCount,
          cycle_started_at: now,
        });
      } else {
        // 예산으로 중단 → 부분 수신(커서는 syncZone이 이미 저장). stale 정리 금지.
        // 이 zcode부터 다음 호출에서 이어받음.
        resumeFrom = zcode;
        break;
      }
      await sleep(REQUEST_DELAY_MS);
    } catch (e) {
      // 이 시도는 실패 → stale 정리에서 제외(과삭제 가드). 사유 기록.
      fetchErrors.push(`z${zcode}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    asOf: now,
    mode: single ? `single(z${single})` : 'nationwide',
    cursorEnabled: cursorsAvailable, // false면 마이그레이션(0016) 미적용 → page1부터(대형 시도 미완 가능)
    zcodes: targets.length,
    okZcodes,                 // 이번 호출에서 cycle 완료·정리까지 끝난 시도 목록
    okZcodesCount: okZcodes.length,
    apiCalls,
    totalUpserts,
    totalSkipped,
    staleDeleted,
    elapsedMs: Date.now() - startedAt,
    resumeFrom,               // null이면 이번 호출 범위는 종료. 값이 있으면 다음 호출이 이어받을 첫 zcode.
    progress,                 // zcode별 startPage/lastPage/nextPage/total/완료여부
    fetchErrors: fetchErrors.length ? fetchErrors : undefined,
  });
}
