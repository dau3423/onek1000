// 주유 타이밍 예측 누적 정확도(hit-rate) 집계 — 서버 전용(read-only).
//
// 내부 검증용 cron JSON 라우트(/api/internal/forecast-accuracy)와 관리자 대시보드
// (/admin/forecast)가 공통으로 호출한다. 집계 로직 중복을 막기 위해 한곳에 모은다.
//
// ⚠️ PostgREST 기본 1000행 제한: 백필 후 평가건이 수천 건이면 잘려서 hit-rate가 과거
//    일부만 반영된다. .range 로 끝까지 페이지네이션해 전수 집계한다(아래 READ_PAGE 루프).
//
// graceful: USE_MOCK / Supabase 미설정이면 skipped=true 로 빈 통계를 반환(throw 안 함).

import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { FORECAST_CONFIG } from '@/lib/forecast/config';

/** 방향별 적중 분해(예측 방향 기준). */
export interface DirectionStat {
  n: number;
  hits: number;
  hitRate: number | null;
}

/** 유종별 집계 + 방향별 분해. */
export interface FuelStat {
  n: number;
  hitRate: number | null;
  byDirection: Record<string, DirectionStat>;
}

/** 최근 예측 1건(평가결과 join — 미평가는 hit=null). */
export interface RecentForecast {
  forecastDate: string;
  targetDate: string;
  fuelType: string;
  direction: string;
  confidence: number;
  horizonDays: number;
  hit: boolean | null;
  actualDirection: string | null;
  actualChangePct: number | null;
}

/** getForecastAccuracy 반환 형태. cron JSON 라우트 응답과 호환. */
export interface ForecastAccuracy {
  /** mock/미설정으로 집계를 건너뛴 경우 true(이때 통계는 모두 빈 값). */
  skipped: boolean;
  skipReason?: string;
  modelVersion: string;
  overall: { n: number; hits: number; hitRate: number | null };
  byFuel: Record<string, FuelStat>;
  /** 방향별 전체(유종 합산) 분해 — '보합' 약점 가시화용. */
  byDirection: Record<string, DirectionStat>;
  /** target_date 지났지만 아직 평가 안 된 건수(데이터 결측 등). */
  pendingEval: number;
  recent: RecentForecast[];
}

interface Options {
  /** 집계 대상 모델 버전. 기본 FORECAST_CONFIG.version. */
  modelVersion?: string;
  /** 최근 예측 조회 건수(1~100). 기본 20. */
  recentLimit?: number;
}

function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}

/**
 * 예측 누적 정확도 집계. 외부(cron 라우트/관리자 페이지)에서 동일하게 호출한다.
 *
 * @throws DB 조회 에러는 그대로 throw(호출부에서 처리). 단, mock/미설정은 throw 없이
 *   skipped=true 로 graceful 반환.
 */
export async function getForecastAccuracy(opts: Options = {}): Promise<ForecastAccuracy> {
  const model = opts.modelVersion ?? FORECAST_CONFIG.version;
  const recentLimit = Math.min(100, Math.max(1, opts.recentLimit ?? 20));

  const empty: ForecastAccuracy = {
    skipped: true,
    modelVersion: model,
    overall: { n: 0, hits: 0, hitRate: null },
    byFuel: {},
    byDirection: {},
    pendingEval: 0,
    recent: [],
  };

  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return { ...empty, skipReason: 'mock mode or supabase not configured' };
  }

  const sb = getSupabase();

  type Joined = {
    hit: boolean;
    actual_direction: string;
    price_forecast:
      | { fuel_type: string; direction: string }
      | { fuel_type: string; direction: string }[];
  };

  // 평가된 예측 전부(통계용). price_forecast inner join forecast_eval.
  // PostgREST 기본 1000행 제한에서 잘리지 않도록 .range 로 끝까지 페이지네이션.
  const READ_PAGE = 1000;
  const MAX_PAGES = 10000;
  const rows: Joined[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * READ_PAGE;
    const { data, error } = await sb
      .from('forecast_eval')
      .select(
        'hit, actual_direction, actual_change_pct, price_forecast!inner(fuel_type, direction, model_version)',
      )
      .eq('price_forecast.model_version', model)
      .order('forecast_id', { ascending: true })
      .range(from, from + READ_PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Joined[];
    rows.push(...batch);
    if (batch.length < READ_PAGE) break;
  }

  const pf = (r: Joined) => (Array.isArray(r.price_forecast) ? r.price_forecast[0] : r.price_forecast);

  const overall = { n: rows.length, hits: rows.filter((r) => r.hit).length };

  // 유종별 집계 + 방향별 분해(예측 방향 기준).
  const byFuel: Record<string, FuelStat> = {};
  // 방향별 전체 합산('보합' 약점 가시화).
  const byDirection: Record<string, DirectionStat> = {};
  for (const r of rows) {
    const fuel = pf(r).fuel_type;
    const dir = pf(r).direction;
    const f = (byFuel[fuel] ??= { n: 0, hitRate: null, byDirection: {} });
    f.n += 1;
    const d = (f.byDirection[dir] ??= { n: 0, hits: 0, hitRate: null });
    d.n += 1;
    if (r.hit) d.hits += 1;

    const g = (byDirection[dir] ??= { n: 0, hits: 0, hitRate: null });
    g.n += 1;
    if (r.hit) g.hits += 1;
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
  for (const dir of Object.keys(byDirection)) {
    const g = byDirection[dir];
    g.hitRate = g.n > 0 ? round3(g.hits / g.n) : null;
  }

  // 최근 예측 N건 + 평가결과 join(미평가는 hit null).
  const { data: recentRaw, error: rErr } = await sb
    .from('price_forecast')
    .select(
      'id, forecast_date, target_date, fuel_type, direction, confidence, horizon_days, forecast_eval(hit, actual_direction, actual_change_pct)',
    )
    .eq('model_version', model)
    .order('forecast_date', { ascending: false })
    .limit(recentLimit);
  if (rErr) throw new Error(rErr.message);

  const recent: RecentForecast[] = (recentRaw ?? []).map((r) => {
    const row = r as {
      id: number;
      forecast_date: string;
      target_date: string;
      fuel_type: string;
      direction: string;
      confidence: number;
      horizon_days: number;
      forecast_eval:
        | { hit: boolean; actual_direction: string; actual_change_pct: number }
        | { hit: boolean; actual_direction: string; actual_change_pct: number }[]
        | null;
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
  const pendingEvalRaw = (pastCount ?? 0) - overall.n;

  return {
    skipped: false,
    modelVersion: model,
    overall: {
      n: overall.n,
      hits: overall.hits,
      hitRate: overall.n > 0 ? round3(overall.hits / overall.n) : null,
    },
    byFuel,
    byDirection,
    pendingEval: pendingEvalRaw > 0 ? pendingEvalRaw : 0,
    recent,
  };
}
