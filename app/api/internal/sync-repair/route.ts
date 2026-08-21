// Cron (월 1회 권장 — 원천 갱신주기가 반기라 더 자주 돌 이유가 없다) — 자동차 정비소 적재.
// 원천: 공공데이터포털 「전국자동차정비업체표준데이터」 오픈API(무료·자동승인·이용허락 제한 없음).
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK / Supabase / API키 미설정 시 skip.
//
// 설계 요지(sync-carwash·sync-ev 의 "실패 안전" 교훈 준수):
//  - 페이지네이션(1000행 × 약 37콜)으로 전량 수집 → 청크 upsert(onConflict: shop_key).
//  - 폐업·휴업 행은 적재하지 않는다(normalize 에서 거른다). 좌표 이상치도 드랍.
//  - 실패 안전: 어느 페이지든 실패하면 그 시점까지 upsert 된 것은 두고 **정리(delete)는 하지 않는다**.
//    전체삭제 후 재삽입은 절대 하지 않는다 — 부분 실패가 지도 전체를 비우면 안 된다.
//  - 완주했을 때만 stale 정리: 이번 실행 시작 시각보다 오래된 synced_at 행을 지운다.
//    (원천에서 업체명·주소가 바뀌면 합성키가 바뀌어 옛 행이 남으므로 이 정리가 필요하다.)

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { fetchRepairPage, isRepairApiConfigured, MAX_PAGES, PAGE_SIZE } from '@/lib/repair/client';
import { normalizeItems, type RepairDbRow } from '@/lib/repair/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UPSERT_CHUNK = 1000;

/** 완주 판정에 쓰는 최소 기대 행수. 이보다 적으면 원천 이상으로 보고 정리를 건너뛴다. */
const MIN_EXPECTED_ROWS = 10_000;

async function upsertInChunks(
  sb: ReturnType<typeof getSupabase>,
  rows: RepairDbRow[],
): Promise<number> {
  let ok = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from('repair_shops').upsert(chunk, { onConflict: 'shop_key' });
    if (error) throw new Error(`repair upsert failed (rows ${i}-${i + chunk.length}): ${error.message}`);
    ok += chunk.length;
  }
  return ok;
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  // CRON_SECRET 빈값 가드 — 미설정 시 무조건 거부(Authorization: Bearer undefined 우회 차단).
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (secret.length === 0 || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
    return NextResponse.json({ skipped: true, reason: 'USE_MOCK' });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'supabase not configured' });
  }
  if (!isRepairApiConfigured()) {
    return NextResponse.json({
      skipped: true,
      reason: 'DATA_GO_KR_API_KEY (또는 EV_CHARGER_API_KEY) 미설정 — data.go.kr 활용신청 후 시크릿 등록 필요',
    });
  }

  const startedAt = new Date().toISOString();
  const sb = getSupabase();

  let fetched = 0;
  let upserted = 0;
  let pages = 0;
  let totalCount = 0;
  const dropped = { notOperating: 0, noName: 0, badCoord: 0 };
  let complete = false;
  let failure: string | null = null;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { items, totalCount: tc } = await fetchRepairPage(page);
      pages = page;
      if (tc > 0) totalCount = tc;
      if (items.length === 0) { complete = true; break; }

      fetched += items.length;
      const { rows, stats } = normalizeItems(items);
      dropped.notOperating += stats.dropped.notOperating;
      dropped.noName += stats.dropped.noName;
      dropped.badCoord += stats.dropped.badCoord;

      if (rows.length > 0) upserted += await upsertInChunks(sb, rows);

      // 마지막 페이지 판정: 받은 수가 페이지 크기보다 적으면 끝.
      if (items.length < PAGE_SIZE) { complete = true; break; }
    }
    if (!complete && pages >= MAX_PAGES) {
      failure = `MAX_PAGES(${MAX_PAGES}) 도달 — 원천 행수가 예상보다 많다. 상한을 올려야 한다.`;
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  // stale 정리 — 완주 + 충분한 행수일 때만. 부분 실패면 건너뛴다(기존 스냅샷 보존).
  let deleted = 0;
  let cleanupSkipped: string | null = null;
  if (!complete || failure) {
    cleanupSkipped = failure ?? '수집 미완주';
  } else if (upserted < MIN_EXPECTED_ROWS) {
    cleanupSkipped = `수집 행수(${upserted})가 기대치(${MIN_EXPECTED_ROWS}) 미만 — 원천 이상 의심`;
  } else {
    const { data, error } = await sb
      .from('repair_shops')
      .delete()
      .lt('synced_at', startedAt)
      .select('shop_key');
    if (error) cleanupSkipped = `정리 실패: ${error.message}`;
    else deleted = data?.length ?? 0;
  }

  return NextResponse.json({
    ok: failure === null,
    startedAt,
    pages,
    totalCount,
    fetched,
    upserted,
    dropped,
    deleted,
    cleanupSkipped,
    error: failure,
  }, { status: failure === null ? 200 : 500 });
}
