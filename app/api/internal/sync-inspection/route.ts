// Cron (월 1회 권장 — 원천 갱신주기가 반기) — 자동차검사소 적재.
// 원천: 공공데이터포털 「전국자동차검사소표준데이터」(무료·자동승인).
// Authorization: Bearer ${CRON_SECRET}.
//
// 이 데이터가 채우는 자리: 지도의 정비소 레이어에서 '자동차검사소' 필터.
// 예전에는 정비업체 업체명에 '검사'가 들어갔는지로 추측해 121곳만 잡혔다(lib/repair/brand.ts 주석).
//
// 실패 안전 규칙은 lib/dataGoKr/syncRunner.ts 가 공통 담당.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { isDataGoKrConfigured } from '@/lib/dataGoKr/standardApi';
import { runStandardSync } from '@/lib/dataGoKr/syncRunner';
import { fetchInspectionPage, MAX_PAGES } from '@/lib/inspection/client';
import { normalizeInspectionItems } from '@/lib/inspection/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 정리를 허용하는 최소 수집 행수.
 *  실측(2026-08-24 전수): 821행 → 818곳. 절반 아래면 원천 이상으로 보고 정리를 건너뛴다. */
const MIN_EXPECTED_ROWS = 400;

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
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
    table: 'inspection_stations',
    conflictKey: 'place_key',
    fetchPage: fetchInspectionPage,
    normalize: normalizeInspectionItems,
    maxPages: MAX_PAGES,
    minExpectedRows: MIN_EXPECTED_ROWS,
    dryRun,
    pageCap: Number.isFinite(maxPagesParam) && maxPagesParam > 0 ? maxPagesParam : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
