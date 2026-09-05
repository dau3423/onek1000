// Cron (월 1회 권장 — 원천 갱신주기가 분기라 더 자주 돌 이유가 없다) — 주차장 적재.
// 원천: 공공데이터포털 「전국주차장정보표준데이터」 tn_pubr_prkplce_info_api.
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK / Supabase / API키 미설정 시 skip.
//
// 실패 안전 규칙은 lib/dataGoKr/syncRunner.ts 가 공통으로 담당한다
// (부분 실패 시 삭제 금지, 완주 시에만 stale 정리, 삭제 비율 가드, dryRun).
//
// 기획: docs/improvements/2026-08-28-parking/plan.md (1단계)

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { isDataGoKrConfigured } from '@/lib/dataGoKr/standardApi';
import { runStandardSync } from '@/lib/dataGoKr/syncRunner';
import { fetchParkingPage, MAX_PAGES } from '@/lib/parking/client';
import { normalizeParkingItems } from '@/lib/parking/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 정리를 허용하는 최소 수집 행수.
 *  실측(2026-09-05): 원천 totalCount 18,878건.
 *  절반 아래로 떨어지면 원천 이상으로 보고 정리를 건너뛴다. */
const MIN_EXPECTED_ROWS = 9_000;

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  // CRON_SECRET 빈값 가드 — 미설정 시 무조건 거부(Bearer undefined 우회 차단).
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
  if (!isDataGoKrConfigured()) {
    return NextResponse.json({
      skipped: true,
      reason: 'DATA_GO_KR_API_KEY (또는 EV_CHARGER_API_KEY) 미설정 — data.go.kr 활용신청 후 시크릿 등록 필요',
    });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === '1';
  const maxPagesParam = Number(url.searchParams.get('maxPages'));

  const result = await runStandardSync(getSupabase(), {
    table: 'parking_lots',
    conflictKey: 'place_key',
    fetchPage: fetchParkingPage,
    normalize: normalizeParkingItems,
    maxPages: MAX_PAGES,
    minExpectedRows: MIN_EXPECTED_ROWS,
    dryRun,
    pageCap: Number.isFinite(maxPagesParam) && maxPagesParam > 0 ? maxPagesParam : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
