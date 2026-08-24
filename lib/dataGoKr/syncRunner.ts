// 표준데이터 → 우리 테이블 적재 공통 러너.
//
// sync-carwash / sync-ev / sync-repair 에서 값비싸게 배운 "실패 안전" 규칙을 한 곳에 모은다.
// 이 규칙들은 취향이 아니라 **사고 재발 방지책**이다:
//
//  1) 전체 삭제 후 재삽입은 절대 하지 않는다. 부분 실패가 지도 전체를 비우면 안 된다.
//  2) 정리(delete)는 **완주했을 때만** 한다. 어느 페이지든 실패하면 기존 스냅샷을 그대로 둔다.
//  3) 정리 전에 삭제 대상 수를 먼저 센다. 그 수가 이번 수집분의 일정 비율을 넘으면 멈춘다.
//     — synced_at 을 upsert 페이로드에 빠뜨려 정비소 테이블이 통째로 비워진 사고가 실제로 있었다.
//     conflict-update 는 컬럼 기본값을 적용하지 않으므로 synced_at 은 반드시 행에 실려야 한다.
//  4) dryRun 으로 원천 응답 구조 변화를 쓰기 전에 확인할 수 있어야 한다.

import type { getSupabase } from '@/lib/db/supabase';
import { PAGE_SIZE, type StandardPage } from './standardApi';

type Sb = ReturnType<typeof getSupabase>;

const UPSERT_CHUNK = 1000;

// TRow 제약을 object 로 둔다 — 도메인의 DbRow 는 interface 라
// Record<string, unknown> 에 자동 할당되지 않는다(index signature 부재).
export interface SyncOptions<TItem, TRow extends object> {
  /** 대상 테이블명. */
  table: string;
  /** upsert 충돌 컬럼(PK). PostgREST 는 컬럼 이름만 받는다. */
  conflictKey: string;
  /** 페이지 조회 함수. */
  fetchPage: (pageNo: number) => Promise<StandardPage<TItem>>;
  /** 원문 → DB 행. syncedAt 을 반드시 각 행에 실어야 한다(위 3번). */
  // stats 도 같은 이유(interface 에 index signature 부재)로 object 로 받는다.
  // 러너는 숫자 필드만 골라 누적하므로 모양을 강제할 필요가 없다.
  normalize: (items: TItem[], syncedAt: string) => { rows: TRow[]; stats: object };
  /** 이 API 의 페이지 상한(폭주 가드). */
  maxPages: number;
  /**
   * 정리를 허용하는 최소 수집 행수. 이보다 적으면 원천 이상으로 보고 정리를 건너뛴다.
   * 원천 규모에 맞춰 호출부가 정한다(정비소 1만, 렌터카·검사소는 훨씬 작다).
   */
  minExpectedRows: number;
  /** 삭제 대상이 이번 수집분의 이 비율을 넘으면 정리 중단. 기본 20%. */
  cleanupMaxRatio?: number;
  /** ?dryRun=1 — 수집·정규화만 하고 DB 에 쓰지 않는다. */
  dryRun?: boolean;
  /** ?maxPages=N — 페이지 수를 줄여 빠르게 확인. */
  pageCap?: number;
}

export interface SyncResult<TRow> {
  ok: boolean;
  startedAt: string;
  pages: number;
  totalCount: number;
  fetched: number;
  upserted: number;
  deleted: number;
  cleanupSkipped: string | null;
  error: string | null;
  /** normalize 가 돌려준 통계의 누적(숫자 필드만 합산). */
  stats: Record<string, number>;
  /** dryRun 일 때만 — 정규화 결과 표본 3건. */
  sample?: TRow[];
}

async function upsertInChunks<TRow extends object>(
  sb: Sb, table: string, conflictKey: string, rows: TRow[],
): Promise<number> {
  let ok = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    // PostgREST 클라이언트는 행 타입을 모른다(테이블명이 런타임 문자열) — 여기서만 좁힌다.
    const { error } = await sb.from(table).upsert(chunk as unknown as Record<string, unknown>[], { onConflict: conflictKey });
    if (error) throw new Error(`${table} upsert failed (rows ${i}-${i + chunk.length}): ${error.message}`);
    ok += chunk.length;
  }
  return ok;
}

/** 중첩 통계 객체({dropped:{a:1}})를 평평한 숫자 맵으로 접는다 — 누적 합산용. */
function flattenStats(src: object, prefix = ''): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') out[key] = v;
    else if (v && typeof v === 'object') Object.assign(out, flattenStats(v as object, key));
  }
  return out;
}

export async function runStandardSync<TItem, TRow extends object>(
  sb: Sb,
  opts: SyncOptions<TItem, TRow>,
): Promise<SyncResult<TRow>> {
  const {
    table, conflictKey, fetchPage, normalize, maxPages,
    minExpectedRows, cleanupMaxRatio = 0.2, dryRun = false,
  } = opts;
  const pageCap = opts.pageCap && opts.pageCap > 0 ? Math.min(opts.pageCap, maxPages) : maxPages;

  const startedAt = new Date().toISOString();
  const sample: TRow[] = [];
  const stats: Record<string, number> = {};

  let fetched = 0, upserted = 0, pages = 0, totalCount = 0;
  let complete = false;
  let failure: string | null = null;

  try {
    for (let page = 1; page <= pageCap; page++) {
      const { items, totalCount: tc } = await fetchPage(page);
      pages = page;
      if (tc > 0) totalCount = tc;
      if (items.length === 0) { complete = true; break; }

      fetched += items.length;
      const { rows, stats: pageStats } = normalize(items, startedAt);
      for (const [k, v] of Object.entries(flattenStats(pageStats))) stats[k] = (stats[k] ?? 0) + v;
      if (sample.length < 3) sample.push(...rows.slice(0, 3 - sample.length));

      if (!dryRun && rows.length > 0) upserted += await upsertInChunks(sb, table, conflictKey, rows);
      else if (dryRun) upserted += rows.length;   // "쓸 뻔한 행 수"로 집계

      // 마지막 페이지 판정: 받은 수가 페이지 크기보다 적으면 끝.
      if (items.length < PAGE_SIZE) { complete = true; break; }
    }
    if (!complete && pages >= pageCap && pageCap >= maxPages) {
      failure = `MAX_PAGES(${maxPages}) 도달 — 원천 행수가 예상보다 많다. 상한을 올려야 한다.`;
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  // ── stale 정리 — 완주 + 충분한 행수일 때만 ──
  let deleted = 0;
  let cleanupSkipped: string | null = null;
  if (dryRun) {
    cleanupSkipped = 'dryRun — 쓰기·정리 모두 생략';
  } else if (!complete || failure) {
    cleanupSkipped = failure ?? '수집 미완주';
  } else if (upserted < minExpectedRows) {
    cleanupSkipped = `수집 행수(${upserted})가 기대치(${minExpectedRows}) 미만 — 원천 이상 의심`;
  } else {
    // 지우기 전에 몇 개나 지워질지 먼저 센다. 정상이라면 이번에 못 본 소수만 남아야 한다.
    // 그 수가 방금 upsert 한 행수에 육박하면 synced_at 이 갱신되지 않았다는 뜻이다.
    const { count: staleCount, error: countErr } = await sb
      .from(table)
      .select(conflictKey, { count: 'exact', head: true })
      .lt('synced_at', startedAt);

    if (countErr) {
      cleanupSkipped = `정리 전 카운트 실패: ${countErr.message}`;
    } else if ((staleCount ?? 0) > upserted * cleanupMaxRatio) {
      cleanupSkipped = `정리 중단 — 삭제 대상(${staleCount})이 이번 수집(${upserted})의 `
        + `${cleanupMaxRatio * 100}% 를 넘는다. synced_at 갱신 누락 의심.`;
    } else {
      const { data, error } = await sb.from(table).delete().lt('synced_at', startedAt).select(conflictKey);
      if (error) cleanupSkipped = `정리 실패: ${error.message}`;
      else deleted = data?.length ?? 0;
    }
  }

  return {
    ok: failure === null,
    startedAt, pages, totalCount, fetched, upserted, deleted,
    cleanupSkipped, error: failure, stats,
    ...(dryRun ? { sample } : {}),
  };
}
