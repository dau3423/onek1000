// 주유 타이밍 예측 — 공개(비인증) 신호 API.
// 메인 예측 카드/추이 그래프용. 우리 DB만 사용(외부 API 무관). 비로그인 포함 전체 사용자.
//
// 정확도 공개 범위(확정): "상승·하락 한정 적중률"(up+down 합산 단일 지표)과 복기 타임라인
//   (history, 채점 완료건만)은 공개한다. 전체 hit-rate/방향별 상세(보합 포함)는 여전히
//   내부 전용(/api/internal/forecast-accuracy). 즉 여기선 단일 지표 + 복기만 노출한다.
//
// 응답:
//   latest : 최신 forecast_date 의 (region,fuel) 1건 → { direction, confidence, forecastDate, targetDate, horizonDays }
//            없으면 null(카드 미표시).
//   series : 추이 그래프용 — domestic_price_daily 최근 ~90일 실측 [{date, price}].
//   band   : (선택) 최신 실측가에서 direction·confidence 로 만든 단순 투영 ±밴드. 모델 재구현 아님.
//            데이터 부족/저신뢰면 null.
//
// 공개 API 패턴(avg-price/price-trend) 답습: revalidate 3600s, 파라미터 양자화(고정 enum),
//   USE_MOCK/Supabase 미설정 시 graceful(빈 신호 → 카드 미표시).

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { FORECAST_CONFIG, FORECAST_FUELS, FUEL_TO_MOPS } from '@/lib/forecast/config';
import { getPublicDirectionalAccuracy } from '@/lib/forecast/accuracy';
import { SIDO_NAME } from '@/types/station';

export const revalidate = 3600;
export const runtime = 'nodejs';

// 추이 그래프 윈도(일). 일별 1행/유종이라 90일은 1000행 제한과 무관(<100행).
const SERIES_DAYS = 90;
// 예측 대상 region: 전국(nation) + 시도별(SidoCode '01'..'19'). 화이트리스트로 검증.
const ALLOWED_REGIONS = new Set(['nation', ...Object.keys(SIDO_NAME)]);

type Direction = 'up' | 'flat' | 'down';

interface ForecastResponse {
  product: string;
  region: string;
  latest: {
    direction: Direction;
    confidence: number;
    forecastDate: string;
    targetDate: string;
    horizonDays: number;
  } | null;
  series: { date: string; price: number }[];
  band: {
    targetDate: string;
    center: number; // 최신 실측가(투영 시작점)
    low: number;
    high: number;
  } | null;
  // 상승·하락 한정 적중률(공개). 최근 180일 윈도, flat 제외 단일 지표. 실패/없으면 null.
  accuracy: {
    directionalHitRate: number | null; // 0~1, n=0 이면 null
    n: number; // 집계 표본 수(up+down)
    windowDays: number; // 윈도 일수(180). 0 이면 전체기간
  } | null;
  // 복기 타임라인 — 채점 완료된 과거 예측 최근 20건(forecast_date 내림차순).
  history: Array<{
    forecastDate: string;
    targetDate: string;
    direction: Direction;
    confidence: number;
    actualChangePct: number; // 실측 변화율(%)
    hit: boolean;
  }>;
  // 선행지표 근거(공개) — market_daily(전국 단일) 최근 signalWindow일 변화율%. region 무관.
  //   유효 표본 부족 지표는 개별 null, 셋 다 null이면 drivers 자체 null.
  drivers: {
    mopsChangePct: number | null; // 유종별 MOPS(싱가포르 제품가)
    usdkrwChangePct: number | null; // 원/달러 환율
    dubaiChangePct: number | null; // 두바이 원유
    windowDays: number;
  } | null;
  modelVersion: string;
  asOf: string;
}

// market_daily 한 행(전국 단일, region 컬럼 없음). 변화율 계산에 쓰는 number 컬럼만 명시.
interface MarketRow {
  date: string;
  mops_gasoline: number | null;
  mops_diesel: number | null;
  usdkrw: number | null;
  dubai: number | null;
}

/**
 * rows 의 지정 컬럼에서 [첫 유효값 → 마지막 유효값] 변화율(%)을 계산.
 * non-null·finite 값만 사용. 유효값 2개 미만이거나 첫 값이 0/비finite면 null.
 */
function pctChange(rows: MarketRow[], key: Exclude<keyof MarketRow, 'date'>): number | null {
  const vals: number[] = [];
  for (const r of rows) {
    const v = r[key];
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < 2) return null;
  const first = vals[0];
  const last = vals[vals.length - 1];
  if (!Number.isFinite(first) || first === 0) return null;
  return ((last - first) / first) * 100;
}

function emptyBody(product: string, region: string): ForecastResponse {
  return {
    product,
    region,
    latest: null,
    series: [],
    band: null,
    accuracy: null,
    history: [],
    drivers: null,
    modelVersion: FORECAST_CONFIG.version,
    asOf: new Date().toISOString(),
  };
}

/** YYYY-MM-DD 에 days 더한 날짜(UTC). */
function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * 단순 시각화용 밴드 — 모델 재구현이 아니다.
 * 최신 실측가(center)에서 direction·confidence 만으로 향후 horizon 까지 ± 범위를 만든다.
 *  - 최대 변동폭은 신뢰도에 비례(confidence 100%일 때 MAX_MOVE_PCT, 0%면 0).
 *  - flat/저신뢰는 좁은(혹은 0) 밴드. 방향에 따라 high/low 를 한쪽으로 치우치게.
 */
function buildBand(
  center: number,
  direction: Direction,
  confidence: number,
  forecastDate: string,
  horizonDays: number,
): ForecastResponse['band'] {
  if (!Number.isFinite(center) || center <= 0) return null;
  // 신뢰도 100%에서 ±2.5% 까지를 시각화 상한으로(과장 금지 — 실제 모델 변동폭과 무관한 표시용).
  const MAX_MOVE_PCT = 2.5;
  const movePct = (Math.max(0, Math.min(100, confidence)) / 100) * MAX_MOVE_PCT;
  const delta = Math.round((center * movePct) / 100);
  const targetDate = addDays(forecastDate, horizonDays);
  if (direction === 'flat' || delta === 0) {
    // 보합/저신뢰: 좁은 대칭 밴드(또는 0). center 유지.
    const d = Math.max(0, Math.round((center * 0.3) / 100)); // ±0.3% 정도의 얇은 띠
    return { targetDate, center, low: center - d, high: center + d };
  }
  if (direction === 'up') {
    return { targetDate, center, low: center, high: center + delta };
  }
  // down
  return { targetDate, center, low: center - delta, high: center };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const product = url.searchParams.get('product') ?? 'B027';
  const region = url.searchParams.get('region') ?? 'nation';

  // 입력 검증: 예측 대상 유종/region 화이트리스트. 벗어나면 빈 신호(카드 미표시) — 4xx 아님.
  // (메인 필터에서 LPG/등유 등 비대상 유종을 골라도 카드만 조용히 사라지면 됨)
  const validProduct = (FORECAST_FUELS as readonly string[]).includes(product);
  const validRegion = ALLOWED_REGIONS.has(region);

  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured() || !validProduct || !validRegion) {
    return NextResponse.json(emptyBody(product, region), {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  }

  const sb = getSupabase();
  const model = FORECAST_CONFIG.version;

  try {
    // 1) 최신 예측 1건(해당 region,fuel, model). forecast_date 내림차순 최신.
    const { data: fRaw, error: fErr } = await sb
      .from('price_forecast')
      .select('forecast_date, target_date, direction, confidence, horizon_days')
      .eq('region', region)
      .eq('fuel_type', product)
      .eq('model_version', model)
      .order('forecast_date', { ascending: false })
      .limit(1);
    if (fErr) throw new Error(`price_forecast: ${fErr.message}`);

    const fRow = (fRaw ?? [])[0] as
      | { forecast_date: string; target_date: string; direction: Direction; confidence: number; horizon_days: number }
      | undefined;

    // 2) 추이 시계열 — 최근 ~90일 실측(domestic_price_daily). date >= today-90 + 오름차순.
    //    일별 1행/유종이라 1000행 제한과 무관(범위로 좁혀 읽으면 충분).
    const since = addDays(new Date().toISOString().slice(0, 10), -SERIES_DAYS);
    const { data: sRaw, error: sErr } = await sb
      .from('domestic_price_daily')
      .select('date, avg_price')
      .eq('region', region)
      .eq('fuel_type', product)
      .gte('date', since)
      .order('date', { ascending: true });
    if (sErr) throw new Error(`domestic_price_daily: ${sErr.message}`);

    const series = (sRaw ?? [])
      .map((r) => {
        const row = r as { date: string; avg_price: number | null };
        return { date: row.date, price: row.avg_price };
      })
      .filter((p): p is { date: string; price: number } => p.price != null && Number.isFinite(p.price));

    const latest = fRow
      ? {
          direction: fRow.direction,
          confidence: fRow.confidence,
          forecastDate: fRow.forecast_date,
          targetDate: fRow.target_date,
          horizonDays: fRow.horizon_days,
        }
      : null;

    // 3) 밴드(선택) — 최신 실측가 기준 단순 투영. 시계열이 있고 예측이 있을 때만.
    const lastPrice = series.length ? series[series.length - 1].price : null;
    const band =
      latest && lastPrice != null
        ? buildBand(lastPrice, latest.direction, latest.confidence, latest.forecastDate, latest.horizonDays)
        : null;

    // 4) 상승·하락 한정 적중률(공개) — 최근 180일. 부가 정보라 실패해도 본 응답엔 영향 0.
    let accuracy: ForecastResponse['accuracy'] = null;
    try {
      accuracy = await getPublicDirectionalAccuracy({ region, sinceDays: 180, modelVersion: model });
    } catch (e) {
      console.error('forecast accuracy failed', e);
      accuracy = null;
    }

    // 5) 복기 타임라인 — price_forecast base + 채점 완료건(forecast_eval!inner)을 forecast_date desc 20건 DB 정렬.
    type HistJoined = {
      forecast_date: string;
      target_date: string;
      direction: Direction;
      confidence: number;
      forecast_eval:
        | { hit: boolean; actual_change_pct: number }
        | { hit: boolean; actual_change_pct: number }[];
    };
    let history: ForecastResponse['history'] = [];
    try {
      const { data: hRaw, error: hErr } = await sb
        .from('price_forecast')
        .select('forecast_date, target_date, direction, confidence, forecast_eval!inner(hit, actual_change_pct)')
        .eq('region', region)
        .eq('fuel_type', product)
        .eq('model_version', model)
        .order('forecast_date', { ascending: false })
        .limit(20);
      if (hErr) throw new Error(hErr.message);
      history = ((hRaw ?? []) as HistJoined[]).map((r) => {
        const ev = Array.isArray(r.forecast_eval) ? r.forecast_eval[0] : r.forecast_eval;
        return {
          forecastDate: r.forecast_date,
          targetDate: r.target_date,
          direction: r.direction,
          confidence: Number(r.confidence),
          actualChangePct: Number(ev.actual_change_pct),
          hit: ev.hit,
        };
      });
    } catch (e) {
      console.error('forecast history failed', e);
      history = [];
    }

    // 6) 선행지표 근거(공개) — market_daily 최근 signalWindow일 변화율%. 전국 단일(region 무관).
    //    부가 정보라 실패해도 본 응답엔 영향 0(additive). 셋 다 null이면 drivers 자체 null.
    let drivers: ForecastResponse['drivers'] = null;
    try {
      const signalWindow = FORECAST_CONFIG.signalWindow; // =14
      // 결측을 감안해 윈도의 2배 범위를 받아 첫·마지막 유효값으로 변화율을 잡는다.
      const sinceMarket = addDays(new Date().toISOString().slice(0, 10), -(signalWindow * 2));
      const { data: mRaw, error: mErr } = await sb
        .from('market_daily')
        .select('date, mops_gasoline, mops_diesel, usdkrw, dubai')
        .gte('date', sinceMarket)
        .order('date', { ascending: true });
      if (mErr) throw new Error(mErr.message);
      const rows = (mRaw ?? []) as MarketRow[];
      // 유종별 MOPS 컬럼(휘발유/경유). 미정의 유종은 휘발유 폴백.
      const mopsKey = FUEL_TO_MOPS[product] ?? 'mops_gasoline';
      const mopsChangePct = pctChange(rows, mopsKey);
      const usdkrwChangePct = pctChange(rows, 'usdkrw');
      const dubaiChangePct = pctChange(rows, 'dubai');
      if (mopsChangePct == null && usdkrwChangePct == null && dubaiChangePct == null) {
        drivers = null;
      } else {
        drivers = { mopsChangePct, usdkrwChangePct, dubaiChangePct, windowDays: signalWindow };
      }
    } catch (e) {
      console.error('forecast drivers failed', e);
      drivers = null;
    }

    const body: ForecastResponse = {
      product,
      region,
      latest,
      series,
      band,
      accuracy,
      history,
      drivers,
      modelVersion: model,
      asOf: new Date().toISOString(),
    };
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (e) {
    // 예측은 부가 정보다 — 실패해도 본 화면 영향 0(클라이언트는 카드만 생략).
    console.error('forecast api failed', e);
    return NextResponse.json(emptyBody(product, region), {
      headers: { 'Cache-Control': 'public, s-maxage=60' },
    });
  }
}
