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
// PostgREST 기본 한 페이지 행 수. select 에 명시 범위가 없으면 이 값(1000)에서 잘린다.
// 시계열/전체조회는 이 단위로 .range 페이지네이션해 끝까지 읽는다.
const READ_PAGE = 1000;
// 무한루프 방지 안전 상한(READ_PAGE 기준 1000만 행). 정상 데이터에선 절대 도달하지 않음.
const MAX_PAGES = 10000;

/** YYYY-MM-DD 에 days 더한 날짜(UTC 기준). */
function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * PostgREST 기본 1000행 제한을 우회해 쿼리 결과 전체를 읽는다(.range 페이지네이션).
 * - build(from, to): from~to 범위를 지정한 쿼리를 만들어 반환(반드시 .order 로 결정적 정렬할 것).
 * - 한 페이지가 READ_PAGE 미만이면 마지막 페이지로 보고 종료.
 * "전체 시계열"이 필요한 곳 전용. "최신 N건"은 .order(desc).limit(N) 을 쓸 것.
 */
async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * READ_PAGE;
    const { data, error } = await build(from, from + READ_PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < READ_PAGE) break;
  }
  return out;
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

  // ─── 입력 시계열 로드 ───
  // 백필: from~최신 전체(2년치는 domestic 1일 2유종이라 1000행 초과 → 반드시 페이지네이션).
  // 일배치: 최근 윈도만 읽으면 충분(효율). 이동평균/신호창/horizon + 환율 forward-fill 여유 포함.
  //   필요 히스토리 ≈ maWindow+signalWindow+horizon. 결측·주말 갭과 from 컷오프 보정 위해 넉넉히.
  let sinceDate: string | null = null;
  if (!backfill) {
    const needDays = cfg.maWindow + cfg.signalWindow + cfg.horizon + 45;
    sinceDate = addDays(new Date().toISOString().slice(0, 10), -needDays);
  } else if (fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)) {
    // 백필 from 이 주어지면 그 이전 신호창/이동평균 히스토리만 더 읽으면 됨(전체 2016~ 다 읽을 필요 없음).
    sinceDate = addDays(fromParam, -(cfg.maWindow + cfg.signalWindow + cfg.horizon + 45));
  }

  // 전체 시계열은 PostgREST 기본 1000행에서 잘리므로 .range 로 끝까지 페이지네이션해 읽는다.
  let market: MarketRow[];
  let domestic: DomesticRow[];
  try {
    market = await selectAll<MarketRow>((from, to) => {
      let q = sb
        .from('market_daily')
        .select('date, mops_gasoline, mops_diesel, usdkrw')
        .order('date', { ascending: true });
      if (sinceDate) q = q.gte('date', sinceDate);
      return q.range(from, to);
    }, 'market_daily');

    domestic = await selectAll<DomesticRow>((from, to) => {
      let q = sb
        .from('domestic_price_daily')
        .select('date, fuel_type, avg_price')
        .eq('region', 'nation')
        .order('date', { ascending: true });
      if (sinceDate) q = q.gte('date', sinceDate);
      return q.range(from, to);
    }, 'domestic_price_daily');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

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
  // 평가 대상은 백필 후 수천 건이 될 수 있으므로(유종×날짜) 전체를 페이지네이션해 읽는다.
  type PendingRow = {
    id: number; forecast_date: string; target_date: string; fuel_type: string; direction: Direction;
  };
  let pending: PendingRow[];
  try {
    pending = await selectAll<PendingRow>((from, to) =>
      sb
        .from('price_forecast')
        .select('id, forecast_date, target_date, fuel_type, direction')
        .lte('target_date', latestMarketDate)
        .order('forecast_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
      'forecast pending');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  let evaluated = 0;
  if (pending.length > 0) {
    const ids = pending.map((p) => p.id);
    // 이미 평가된 id 조회 — pending 이 수천 건이면 .in() URL/응답행이 모두 한계에 걸리므로
    // id 를 청크로 나눠 조회(각 청크 ≤ READ_PAGE 라 응답이 잘리지 않음).
    const done = new Set<number>();
    try {
      for (let i = 0; i < ids.length; i += READ_PAGE) {
        const chunk = ids.slice(i, i + READ_PAGE);
        const { data: doneRaw, error: eErr } = await sb
          .from('forecast_eval')
          .select('forecast_id')
          .in('forecast_id', chunk);
        if (eErr) throw new Error(`forecast_eval read: ${eErr.message}`);
        for (const r of doneRaw ?? []) done.add((r as { forecast_id: number }).forecast_id);
      }
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }

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
