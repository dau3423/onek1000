// Cron (월 1회 권장 — 원천 갱신주기가 반기라 더 자주 돌 이유가 없다) — 자동차 정비소 적재.
// 원천: 공공데이터포털 「전국자동차정비업체표준데이터」 오픈API(무료·자동승인·이용허락 제한 없음).
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK / Supabase / API키 미설정 시 skip.
//
// 설계 요지(sync-carwash·sync-ev 의 "실패 안전" 교훈 준수):
//  - 페이지네이션(1000행 × 약 37콜)으로 전량 수집 → 청크 upsert(onConflict: shop_key).
//  - 폐업·휴업 행은 적재하지 않는다(normalize 에서 거른다). 좌표 이상치도 드랍.
//  - 실패 안전: 어느 페이지든 실패하면 그 시점까지 upsert 된 것은 두고 **정리(delete)는 하지 않는다**.
//    전체삭제 후 재삽입은 절대 하지 않는다 — 부분 실패가 지도 전체를 비우면 안 된다.
//  - ?dryRun=1 : 수집·정규화만 하고 **DB 에 쓰지 않는다**. 원천 응답 구조가 바뀌었을 때
//    3.6만 행을 잘못 쓰기 전에 확인하는 용도. ?maxPages=N 으로 페이지 수도 줄일 수 있다.
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

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === '1';
  const maxPagesParam = Number(url.searchParams.get('maxPages'));
  const pageCap = Number.isFinite(maxPagesParam) && maxPagesParam > 0
    ? Math.min(maxPagesParam, MAX_PAGES)
    : MAX_PAGES;

  const startedAt = new Date().toISOString();
  const sb = getSupabase();

  // dryRun 에서 정규화가 실제로 무엇을 만들었는지 보기 위한 표본(앞 3건).
  const sample: RepairDbRow[] = [];
  // 유형·기준일 분포 — 코드 매핑이 맞는지 눈으로 확인한다.
  const typeCount = new Map<string, number>();

  let fetched = 0;
  let upserted = 0;
  let pages = 0;
  let totalCount = 0;
  const dropped = { notOperating: 0, noName: 0, badCoord: 0 };
  let complete = false;
  let failure: string | null = null;

  try {
    for (let page = 1; page <= pageCap; page++) {
      const { items, totalCount: tc } = await fetchRepairPage(page);
      pages = page;
      if (tc > 0) totalCount = tc;
      if (items.length === 0) { complete = true; break; }

      fetched += items.length;
      const { rows, stats } = normalizeItems(items);
      dropped.notOperating += stats.dropped.notOperating;
      dropped.noName += stats.dropped.noName;
      dropped.badCoord += stats.dropped.badCoord;

      for (const r of rows) typeCount.set(r.shop_type, (typeCount.get(r.shop_type) ?? 0) + 1);
      if (sample.length < 3) sample.push(...rows.slice(0, 3 - sample.length));

      // dryRun 이면 여기서 쓰지 않는다. 그 외 흐름(페이지네이션·통계)은 동일하게 돈다.
      if (!dryRun && rows.length > 0) upserted += await upsertInChunks(sb, rows);
      else if (dryRun) upserted += rows.length; // "쓸 뻔한 행 수"로 집계

      // 마지막 페이지 판정: 받은 수가 페이지 크기보다 적으면 끝.
      if (items.length < PAGE_SIZE) { complete = true; break; }
    }
    if (!complete && pages >= pageCap) {
      failure = pageCap < MAX_PAGES
        ? null // maxPages 로 일부러 자른 경우는 실패가 아니다
        : `MAX_PAGES(${MAX_PAGES}) 도달 — 원천 행수가 예상보다 많다. 상한을 올려야 한다.`;
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  // stale 정리 — 완주 + 충분한 행수일 때만. 부분 실패면 건너뛴다(기존 스냅샷 보존).
  let deleted = 0;
  let cleanupSkipped: string | null = null;
  if (dryRun) {
    cleanupSkipped = 'dryRun — 쓰기·정리 모두 생략';
  } else if (!complete || failure) {
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
    ...(dryRun ? { dryRun: true, typeCount: Object.fromEntries(typeCount), sample } : {}),
  }, { status: failure === null ? 200 : 500 });
}
