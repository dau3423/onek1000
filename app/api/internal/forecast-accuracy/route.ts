// 내부 검증용(read-only) — 예측 누적 정확도(hit-rate) + 최근 예측 조회.
// Authorization: Bearer ${CRON_SECRET}
//
// 수용기준 ②(매일 신호 생성·저장)·③(누적 정확도 조회) 데모용. JSON 만 반환.
// 관리자 화면(/admin/forecast)도 동일 집계를 쓰며, 집계 로직은 lib/forecast/accuracy.ts 에
// 한곳으로 모았다(중복 금지). 여기서는 인증 + 그 함수 호출 + JSON 직렬화만 한다.
//
// 응답:
//   overall          : 전체(평가된 건) hit-rate, n
//   byFuel           : 유종별 hit-rate, n, 방향별 적중 분해
//   byDirection      : 방향별 전체(유종 합산) 분해
//   recent           : 최근 예측 N건(평가 결과 join — 미평가는 hit=null)
//   pendingEval      : target_date 지났지만 아직 평가 안 된 건수(데이터 결측 등)
//
// graceful: USE_MOCK / Supabase 미설정이면 skipped:true 로 빈 통계.

import { NextResponse } from 'next/server';
import { getForecastAccuracy } from '@/lib/forecast/accuracy';
import { FORECAST_CONFIG } from '@/lib/forecast/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const model = url.searchParams.get('model') ?? FORECAST_CONFIG.version;
  const recentLimit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));

  try {
    const acc = await getForecastAccuracy({ modelVersion: model, recentLimit });

    if (acc.skipped) {
      return NextResponse.json({
        skipped: true,
        reason: acc.skipReason ?? 'skipped',
        overall: acc.overall,
        byFuel: acc.byFuel,
        recent: acc.recent,
      });
    }

    return NextResponse.json({
      ok: true,
      modelVersion: acc.modelVersion,
      overall: acc.overall,
      byFuel: acc.byFuel,
      byDirection: acc.byDirection,
      pendingEval: acc.pendingEval,
      recent: acc.recent,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
