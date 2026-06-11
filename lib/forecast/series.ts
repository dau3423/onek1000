// 주유 타이밍 예측 — DB 원시행 → 모델 입력 시계열 변환(순수함수, DB 의존 없음).
//
// run-forecast 라우트가 market_daily / domestic_price_daily 를 한 번에 읽어와, 유종별로
// 이 헬퍼들을 호출해 모델 입력을 만든다(누설 방지를 위해 forecast_date 컷오프는 여기서 적용).

import { type SeriesPoint } from './model';
import { FUEL_TO_MOPS } from './config';

export interface MarketRow {
  date: string; // YYYY-MM-DD
  mops_gasoline: number | null;
  mops_diesel: number | null;
  usdkrw: number | null;
}

export interface DomesticRow {
  date: string; // YYYY-MM-DD
  fuel_type: string;
  avg_price: number | null;
}

/** YYYY-MM-DD 문자열 비교(사전식==시간식). */
function lte(a: string, b: string): boolean {
  return a <= b;
}

/**
 * 선행지표 LI = mops(유종) × usdkrw 시계열.
 * - asOf 가 주어지면 그 날짜 이하만 포함(미래정보 누설 방지).
 * - usdkrw 가 결측인 날은 가장 최근 유효 환율로 forward-fill(주말/공휴일 환율 결측 대응).
 *   (제품가가 발표된 날에 그날 환율이 없으면 직전 영업일 환율로 환산)
 */
export function buildLiSeries(
  market: MarketRow[],
  fuelType: string,
  asOf?: string,
): SeriesPoint[] {
  const mopsKey = FUEL_TO_MOPS[fuelType];
  if (!mopsKey) return [];
  const sorted = [...market].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: SeriesPoint[] = [];
  let lastFx: number | null = null;
  for (const r of sorted) {
    if (asOf && !lte(r.date, asOf)) break;
    if (r.usdkrw != null && Number.isFinite(r.usdkrw)) lastFx = r.usdkrw;
    const mops = r[mopsKey];
    const fx = r.usdkrw ?? lastFx;
    const value = mops != null && fx != null && Number.isFinite(mops) && Number.isFinite(fx)
      ? mops * fx
      : null;
    out.push({ date: r.date, value });
  }
  return out;
}

/**
 * 특정 유종의 국내 소매가 시계열(오름차순).
 * - asOf 가 주어지면 그 날짜 이하만 포함.
 */
export function buildDomesticSeries(
  domestic: DomesticRow[],
  fuelType: string,
  asOf?: string,
): SeriesPoint[] {
  return domestic
    .filter((r) => r.fuel_type === fuelType && (!asOf || lte(r.date, asOf)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((r) => ({ date: r.date, value: r.avg_price ?? null }));
}

/**
 * target 날짜에 "가장 가까운(그 이하 우선, 없으면 이상)" 유효 가격을 찾는다.
 * 평가 시 target_date 당일 가격이 결측이면 직전 영업일 값으로 대체하기 위함.
 * toleranceDays 를 넘는 갭이면 null(평가 보류).
 */
export function priceNear(
  series: SeriesPoint[],
  target: string,
  toleranceDays = 5,
): number | null {
  const valid = series.filter((p) => p.value != null && Number.isFinite(p.value)) as Array<{
    date: string;
    value: number;
  }>;
  if (valid.length === 0) return null;
  const targetMs = Date.parse(`${target}T00:00:00Z`);
  let best: { value: number; gap: number } | null = null;
  for (const p of valid) {
    const gap = Math.abs(Date.parse(`${p.date}T00:00:00Z`) - targetMs) / 86400000;
    if (gap <= toleranceDays && (best == null || gap < best.gap)) {
      best = { value: p.value, gap };
    }
  }
  return best ? best.value : null;
}
