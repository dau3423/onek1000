// Cron (1일 1회, sync-market 이후) — 주유 타이밍 예측 생성 + 사후 평가.
// Authorization: Bearer ${CRON_SECRET}
//
// 입력(0025): market_daily(선행지표) + domestic_price_daily(region='nation', B027/D047).
// 출력(0026): price_forecast(오늘자 방향성 예측 upsert) + forecast_eval(과거 예측 채점 upsert).
//
// 모드:
//   기본            : 오늘자(=최신 데이터 시점) 예측 생성 + target_date 지난 미평가 예측 평가.
//   ?backfill=1     : 적재된 과거 데이터로 과거 시점 예측을 소급 생성·평가(hit-rate 즉시 채움).
//     - ?from=YYYY-MM-DD : 백필 시작일(미지정 시 데이터 시작+신호창 이후부터).
//     - ?step=N          : 백필 시 며칠 간격으로 forecast_date 를 잡을지(기본 1=매일).
//   각 forecast_date 시점엔 그 날짜 이하 데이터만 사용(미래정보 누설 금지).
//
// graceful: USE_MOCK / Supabase 미설정이면 skip. 데이터 부족하면 예측 생략(생성 0건).
//   sync-market 과 동작 분리(별도 라우트). 스케줄은 sync-market 이후에 등록.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { FORECAST_CONFIG, FORECAST_FUELS } from '@/lib/forecast/config';
import { forecast, actualDirection, type Direction } from '@/lib/forecast/model';
import {
  buildLiSeries, buildDomesticSeries, priceNear,
  type MarketRow, type DomesticRow,
} from '@/lib/forecast/series';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const UPSERT_CHUNK = 500;

/** YYYY-MM-DD 에 days 더한 날짜(UTC 기준). */
function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function inChunks<T>(
  rows: T[],
  size: number,
  fn: (chunk: T[]) => Promise<{ error: { message: string } | null }>,
  label: string,
) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await fn(chunk);
    if (error) throw new Error(`${label} failed (rows ${i}-${i + chunk.length}): ${error.message}`);
  }
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'mock mode or supabase not configured' });
  }

  const url = new URL(req.url);
  const backfill = url.searchParams.get('backfill') === '1' || url.searchParams.has('from');
  const fromParam = url.searchParams.get('from');
  const step = Math.max(1, Number(url.searchParams.get('step')) || 1);

  const cfg = FORECAST_CONFIG;
  const sb = getSupabase();
  const nowIso = new Date().toISOString();

  // ─── 입력 시계열 일괄 로드(전체 — 멀어야 수천 행) ───
  const { data: marketRaw, error: mErr } = await sb
    .from('market_daily')
    .select('date, mops_gasoline, mops_diesel, usdkrw')
    .order('date', { ascending: true });
  if (mErr) return NextResponse.json({ error: `market_daily: ${mErr.message}` }, { status: 500 });

  const { data: domesticRaw, error: dErr } = await sb
    .from('domestic_price_daily')
    .select('date, fuel_type, avg_price')
    .eq('region', 'nation')
    .order('date', { ascending: true });
  if (dErr) return NextResponse.json({ error: `domestic_price_daily: ${dErr.message}` }, { status: 500 });

  const market = (marketRaw ?? []) as MarketRow[];
  const domestic = (domesticRaw ?? []) as DomesticRow[];

  if (market.length === 0) {
    return NextResponse.json({ ok: true, note: 'market_daily 비어있음 — 예측 생략', created: 0, evaluated: 0 });
  }

  const latestMarketDate = market[market.length - 1].date;

  // ─── 1) 예측 생성 ───
  // forecast_date 후보 목록: 기본은 최신일 1개, 백필이면 (from 또는 데이터시작+신호창)~최신일.
  const forecastDates: string[] = [];
  if (backfill) {
    const firstMarket = market[0].date;
    // 신호창+이동평균 길이만큼 지난 뒤부터 의미있는 예측 가능.
    const earliest = addDays(firstMarket, cfg.signalWindow + cfg.maWindow);
    let start = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : earliest;
    if (start < earliest) start = earliest;
    // start..latest 를 step 간격으로(각 날짜에 실제 market 행이 있는 날만 쓰면 더 정확하나,
    // 모델이 asOf 컷오프로 알아서 마지막 유효일을 forecastDate 로 잡으므로 날짜격자로 충분).
    const marketDates = market.map((m) => m.date).filter((d) => d >= start && d <= latestMarketDate);
    for (let i = 0; i < marketDates.length; i += step) forecastDates.push(marketDates[i]);
    // 최신일은 항상 포함.
    if (forecastDates[forecastDates.length - 1] !== latestMarketDate) forecastDates.push(latestMarketDate);
  } else {
    forecastDates.push(latestMarketDate);
  }

  type ForecastRow = {
    forecast_date: string;
    target_date: string;
    region: string;
    fuel_type: string;
    direction: Direction;
    confidence: number;
    horizon_days: number;
    model_version: string;
    created_at: string;
  };

  const forecastRows: ForecastRow[] = [];
  let skipped = 0;
  for (const asOf of forecastDates) {
    for (const fuel of FORECAST_FUELS) {
      const li = buildLiSeries(market, fuel, asOf);
      const dom = buildDomesticSeries(domestic, fuel, asOf);
      const result = forecast({ li, domestic: dom }, cfg);
      if (!result.ok || !result.forecastDate) { skipped++; continue; }
      forecastRows.push({
        forecast_date: result.forecastDate,
        target_date: addDays(result.forecastDate, cfg.horizon),
        region: 'nation',
        fuel_type: fuel,
        direction: result.direction,
        confidence: result.confidence,
        horizon_days: cfg.horizon,
        model_version: cfg.version,
        created_at: nowIso,
      });
    }
  }

  let created = 0;
  try {
    if (forecastRows.length > 0) {
      await inChunks(forecastRows, UPSERT_CHUNK,
        async (chunk) => await sb.from('price_forecast').upsert(chunk, {
          onConflict: 'forecast_date,region,fuel_type,model_version',
        }),
        'price_forecast upsert');
      created = forecastRows.length;
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // ─── 2) 평가: target_date 가 지났고 아직 평가 안 된 예측을 채점 ───
  // 평가 대상은 "target_date <= latestMarketDate(=관측 가능)"인 예측 전부.
  const { data: pendingRaw, error: pErr } = await sb
    .from('price_forecast')
    .select('id, forecast_date, target_date, fuel_type, direction')
    .lte('target_date', latestMarketDate)
    .order('forecast_date', { ascending: true });
  if (pErr) return NextResponse.json({ error: `forecast pending: ${pErr.message}` }, { status: 500 });

  // 이미 평가된 id 제외.
  const pending = (pendingRaw ?? []) as Array<{
    id: number; forecast_date: string; target_date: string; fuel_type: string; direction: Direction;
  }>;
  let evaluated = 0;
  if (pending.length > 0) {
    const ids = pending.map((p) => p.id);
    const { data: doneRaw, error: eErr } = await sb
      .from('forecast_eval')
      .select('forecast_id')
      .in('forecast_id', ids);
    if (eErr) return NextResponse.json({ error: `forecast_eval read: ${eErr.message}` }, { status: 500 });
    const done = new Set((doneRaw ?? []).map((r) => (r as { forecast_id: number }).forecast_id));

    // 유종별 국내가 시계열 캐시(asOf 컷 없이 전체).
    const domCache = new Map<string, ReturnType<typeof buildDomesticSeries>>();
    const getDom = (fuel: string) => {
      let s = domCache.get(fuel);
      if (!s) { s = buildDomesticSeries(domestic, fuel); domCache.set(fuel, s); }
      return s;
    };

    type EvalRow = {
      forecast_id: number;
      actual_direction: Direction;
      actual_change_pct: number;
      hit: boolean;
      evaluated_at: string;
    };
    const evalRows: EvalRow[] = [];
    for (const p of pending) {
      if (done.has(p.id)) continue;
      const dom = getDom(p.fuel_type);
      const fromPrice = priceNear(dom, p.forecast_date);
      const toPrice = priceNear(dom, p.target_date);
      const actual = actualDirection(fromPrice, toPrice, cfg);
      if (!actual) continue; // 가격 결측 → 평가 보류(다음 배치에서 재시도)
      evalRows.push({
        forecast_id: p.id,
        actual_direction: actual.direction,
        actual_change_pct: actual.changePct,
        hit: actual.direction === p.direction,
        evaluated_at: nowIso,
      });
    }

    try {
      if (evalRows.length > 0) {
        await inChunks(evalRows, UPSERT_CHUNK,
          async (chunk) => await sb.from('forecast_eval').upsert(chunk, { onConflict: 'forecast_id' }),
          'forecast_eval upsert');
        evaluated = evalRows.length;
      }
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    asOf: nowIso,
    modelVersion: cfg.version,
    mode: backfill ? 'backfill' : 'daily',
    latestMarketDate,
    forecastDates: forecastDates.length,
    created,
    skipped,
    evaluated,
  });
}
