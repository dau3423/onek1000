// 주유 타이밍 예측 — 공개(비인증) 신호 API.
// 메인 예측 카드/추이 그래프용. 우리 DB만 사용(외부 API 무관). 비로그인 포함 전체 사용자.
//
// 주의: 정확도(hit-rate)는 '내부용'이라 여기서 절대 노출하지 않는다(요구사항).
//   누적 정확도는 인증 보호된 /api/internal/forecast-accuracy 전용.
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
import { FORECAST_CONFIG, FORECAST_FUELS } from '@/lib/forecast/config';

export const revalidate = 3600;
export const runtime = 'nodejs';

// 추이 그래프 윈도(일). 일별 1행/유종이라 90일은 1000행 제한과 무관(<100행).
const SERIES_DAYS = 90;
// 예측 대상 region(현재 'nation'만 적재됨). 파라미터로 받아두되 화이트리스트로 검증.
const ALLOWED_REGIONS = new Set(['nation']);

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
  modelVersion: string;
  asOf: string;
}

function emptyBody(product: string, region: string): ForecastResponse {
  return {
    product,
    region,
    latest: null,
    series: [],
    band: null,
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

    const body: ForecastResponse = {
      product,
      region,
      latest,
      series,
      band,
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
