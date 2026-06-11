// 내부 검증용(read-only) — 예측 누적 정확도(hit-rate) + 최근 예측 조회.
// Authorization: Bearer ${CRON_SECRET}
//
// 수용기준 ②(매일 신호 생성·저장)·③(누적 정확도 조회) 데모용. JSON 만 반환(대시보드 UI 없음).
//
// 응답:
//   overall          : 전체(평가된 건) hit-rate, n
//   byFuel           : 유종별 hit-rate, n, 방향별 적중 분해
//   recent           : 최근 예측 N건(평가 결과 join — 미평가는 hit=null)
//   pendingEval      : target_date 지났지만 아직 평가 안 된 건수(데이터 결측 등)
//
// graceful: USE_MOCK / Supabase 미설정이면 빈 통계로 skip 표기.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { FORECAST_CONFIG } from '@/lib/forecast/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return NextResponse.json({
      skipped: true,
      reason: 'mock mode or supabase not configured',
      overall: { n: 0, hitRate: null },
      byFuel: {},
      recent: [],
    });
  }

  const url = new URL(req.url);
  const model = url.searchParams.get('model') ?? FORECAST_CONFIG.version;
  const recentLimit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));

  const sb = getSupabase();

  type Joined = {
    hit: boolean;
    actual_direction: string;
    price_forecast: { fuel_type: string; direction: string } | { fuel_type: string; direction: string }[];
  };

  // 평가된 예측 전부(통계용). price_forecast inner join forecast_eval.
  // 백필 후엔 수천 건 → PostgREST 기본 1000행 제한에서 잘리면 hit-rate 가 과거 일부만 반영된다.
  // .range 로 끝까지 페이지네이션해 전수 집계한다.
  const READ_PAGE = 1000;
  const MAX_PAGES = 10000;
  const rows: Joined[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * READ_PAGE;
    const { data, error } = await sb
      .from('forecast_eval')
      .select('hit, actual_direction, actual_change_pct, price_forecast!inner(fuel_type, direction, model_version)')
      .eq('price_forecast.model_version', model)
      .order('forecast_id', { ascending: true })
      .range(from, from + READ_PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const batch = (data ?? []) as Joined[];
    rows.push(...batch);
    if (batch.length < READ_PAGE) break;
  }

  const pf = (r: Joined) => (Array.isArray(r.price_forecast) ? r.price_forecast[0] : r.price_forecast);

  const overall = { n: rows.length, hits: rows.filter((r) => r.hit).length };

  // 유종별 집계 + 방향별 분해(예측 방향 기준).
  const byFuel: Record<string, {
    n: number; hitRate: number | null;
    byDirection: Record<string, { n: number; hits: number; hitRate: number | null }>;
  }> = {};
  for (const r of rows) {
    const fuel = pf(r).fuel_type;
    const dir = pf(r).direction;
    const f = (byFuel[fuel] ??= { n: 0, hitRate: null, byDirection: {} });
    f.n += 1;
    const d = (f.byDirection[dir] ??= { n: 0, hits: 0, hitRate: null });
    d.n += 1;
    if (r.hit) d.hits += 1;
  }
  for (const fuel of Object.keys(byFuel)) {
    const f = byFuel[fuel];
    const hits = Object.values(f.byDirection).reduce((a, d) => a + d.hits, 0);
    f.hitRate = f.n > 0 ? round3(hits / f.n) : null;
    for (const dir of Object.keys(f.byDirection)) {
      const d = f.byDirection[dir];
      d.hitRate = d.n > 0 ? round3(d.hits / d.n) : null;
    }
  }

  // 최근 예측 N건 + 평가결과 join(미평가는 hit null).
  const { data: recentRaw, error: rErr } = await sb
    .from('price_forecast')
    .select('id, forecast_date, target_date, fuel_type, direction, confidence, horizon_days, forecast_eval(hit, actual_direction, actual_change_pct)')
    .eq('model_version', model)
    .order('forecast_date', { ascending: false })
    .limit(recentLimit);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const recent = (recentRaw ?? []).map((r) => {
    const row = r as {
      id: number; forecast_date: string; target_date: string; fuel_type: string;
      direction: string; confidence: number; horizon_days: number;
      forecast_eval: { hit: boolean; actual_direction: string; actual_change_pct: number }
        | { hit: boolean; actual_direction: string; actual_change_pct: number }[] | null;
    };
    const ev = Array.isArray(row.forecast_eval) ? row.forecast_eval[0] : row.forecast_eval;
    return {
      forecastDate: row.forecast_date,
      targetDate: row.target_date,
      fuelType: row.fuel_type,
      direction: row.direction,
      confidence: row.confidence,
      horizonDays: row.horizon_days,
      hit: ev ? ev.hit : null,
      actualDirection: ev ? ev.actual_direction : null,
      actualChangePct: ev ? ev.actual_change_pct : null,
    };
  });

  // 평가 대기(target 지남, 평가 없음) 건수.
  const today = new Date().toISOString().slice(0, 10);
  const { count: pastCount } = await sb
    .from('price_forecast')
    .select('id', { count: 'exact', head: true })
    .eq('model_version', model)
    .lte('target_date', today);
  const pendingEval = (pastCount ?? 0) - overall.n;

  return NextResponse.json({
    ok: true,
    modelVersion: model,
    overall: { n: overall.n, hits: overall.hits, hitRate: overall.n > 0 ? round3(overall.hits / overall.n) : null },
    byFuel,
    pendingEval: pendingEval > 0 ? pendingEval : 0,
    recent,
  });
}

function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}
