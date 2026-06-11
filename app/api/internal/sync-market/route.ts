// Cron (1일 1회) — 주유 타이밍 예측용 시장 선행지표 + 국내 소매가 일별 시계열 적재.
// Authorization: Bearer ${CRON_SECRET}
//
// 적재 대상(0025 마이그레이션):
//   market_daily            : 국제 원유(Dubai/Brent/WTI) + MOPS 프록시(휘발유/경유) + USD/KRW
//   domestic_price_daily    : 국내 전국평균 소매가(region='nation', B027/D047)
//                             + 시도별 당일 평균가(region=SidoCode '01'..'19', B027/D047)
//
// ⚠️ 시도별 시계열은 과거 백필 불가: Opinet avgSidoPrice.do 는 "당일 1 스냅샷"만 주고
//    날짜를 반환하지 않는다(과거 조회 엔드포인트 없음). 따라서 시도별 과거 시계열 소스가
//    존재하지 않으며, 시도별 예측은 적재 시작 시점부터 점진적으로만 축적된다.
//    (nation 은 fetchDomesticDaily 의 CSV 로 과거 시계열까지 보유 — 차이에 주의.)
//
// 증분 적재: 기본 최근 LOOKBACK_DAYS(35일)을 재요청해 upsert 한다(후행 정정치 반영).
//   최초 백필은 ?from=YYYYMMDD 로 시작일을 지정한다(to 는 항상 오늘). ?days=N 도 허용.
//
// graceful: USE_MOCK / Supabase 미설정이면 skip(기존 가격 sync 와 동일 정책).
//   소스별 호출이 실패하거나 빈 응답이면 그 소스만 건너뛰고, 기존 데이터는 절대 삭제하지 않는다.
//   (sync-opinet 의 "실패 시 삭제 금지" 관습을 따른다 — upsert-only.)

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import {
  ymd, daysAgo,
  fetchCrudeDaily, fetchMopsDaily, fetchDomesticDaily, fetchUsdKrwDaily,
} from '@/lib/market/client';
import { fetchAvgBySido } from '@/lib/opinet/client';
import type { ProductCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// 후행 정정치 반영을 위한 기본 재요청 창. 국내가/유가는 발표 후 며칠간 미세 정정이 있다.
const LOOKBACK_DAYS = 35;
const UPSERT_CHUNK = 500;

type MarketRow = {
  date: string;
  dubai: number | null;
  wti: number | null;
  brent: number | null;
  mops_gasoline: number | null;
  mops_diesel: number | null;
  usdkrw: number | null;
};

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
  const now = new Date();
  const to = ymd(now);

  // 시작일 결정: ?from=YYYYMMDD 우선, 없으면 ?days=N, 없으면 LOOKBACK_DAYS.
  const fromParam = url.searchParams.get('from');
  const daysParam = Number(url.searchParams.get('days'));
  let from: string;
  let windowDays: number;
  if (fromParam && /^\d{8}$/.test(fromParam)) {
    from = fromParam;
    const fromDate = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}T00:00:00Z`);
    windowDays = Math.max(1, Math.round((now.getTime() - fromDate.getTime()) / 86400000));
  } else {
    windowDays = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : LOOKBACK_DAYS;
    from = ymd(daysAgo(windowDays, now));
  }

  const sb = getSupabase();
  const nowIso = now.toISOString();
  const errors: string[] = [];

  // date → market_daily 행 누적(소스별로 같은 날짜를 부분 채움).
  const marketByDate = new Map<string, MarketRow>();
  const ensure = (date: string): MarketRow => {
    let row = marketByDate.get(date);
    if (!row) {
      row = { date, dubai: null, wti: null, brent: null, mops_gasoline: null, mops_diesel: null, usdkrw: null };
      marketByDate.set(date, row);
    }
    return row;
  };

  // 소스별 결과 카운트(운영 가시성). sidoUpserts 는 시도별 당일 평균 적재 행 수.
  const counts = { crude: 0, mops: 0, fx: 0, domestic: 0, sidoUpserts: 0 };

  // 1) 국제 원유(Dubai/Brent/WTI)
  try {
    const rows = await fetchCrudeDaily(from, to);
    for (const r of rows) {
      const m = ensure(r.date);
      m.dubai = r.dubai;
      m.brent = r.brent;
      m.wti = r.wti;
    }
    counts.crude = rows.length;
  } catch (e) {
    errors.push(`crude: ${(e as Error).message}`);
  }

  // 2) 국제 석유제품(MOPS 프록시)
  try {
    const rows = await fetchMopsDaily(from, to);
    for (const r of rows) {
      const m = ensure(r.date);
      m.mops_gasoline = r.gasoline;
      m.mops_diesel = r.diesel;
    }
    counts.mops = rows.length;
  } catch (e) {
    errors.push(`mops: ${(e as Error).message}`);
  }

  // 3) USD/KRW (Yahoo)
  try {
    const rows = await fetchUsdKrwDaily(windowDays);
    for (const r of rows) {
      // 조회창(from~to) 밖 날짜는 무시(yahoo range 가 창보다 넓을 수 있음).
      if (r.date.replace(/-/g, '') < from || r.date.replace(/-/g, '') > to) continue;
      ensure(r.date).usdkrw = r.usdkrw;
    }
    counts.fx = rows.length;
  } catch (e) {
    errors.push(`fx: ${(e as Error).message}`);
  }

  // 4) 국내 전국평균 소매가 → domestic_price_daily (region='nation')
  const domesticRows: Array<{ date: string; region: string; fuel_type: string; avg_price: number; updated_at: string }> = [];
  try {
    const rows = await fetchDomesticDaily(from, to);
    for (const r of rows) {
      if (r.gasoline != null) {
        domesticRows.push({ date: r.date, region: 'nation', fuel_type: 'B027', avg_price: r.gasoline, updated_at: nowIso });
      }
      if (r.diesel != null) {
        domesticRows.push({ date: r.date, region: 'nation', fuel_type: 'D047', avg_price: r.diesel, updated_at: nowIso });
      }
    }
    counts.domestic = rows.length;
  } catch (e) {
    errors.push(`domestic: ${(e as Error).message}`);
  }

  // 4-2) 시도별 당일 평균가 → domestic_price_daily (region=SidoCode '01'..'19')
  // ⚠️ avgSidoPrice.do 는 "당일 1 스냅샷"이라 과거 시계열 백필 불가(날짜 미반환).
  //    그래서 date 는 항상 오늘(=to)로 적재하며, 시도별 과거 시계열 소스는 없다.
  //    시도별 예측은 이 적재가 매일 쌓이며 점진 축적된다(nation 과 달리 초기엔 히스토리 부족).
  // nation 적재(위 블록)와 완전 분리: 유종별 try/catch 로 실패해도 nation·다른 유종에 무영향.
  const sidoDate = `${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6, 8)}`; // YYYYMMDD → YYYY-MM-DD
  for (const product of ['B027', 'D047'] as const satisfies readonly ProductCode[]) {
    try {
      const sidoRows = await fetchAvgBySido(product);
      for (const s of sidoRows) {
        const price = s.price;
        if (!Number.isFinite(price) || price <= 0) continue; // 결측/이상치 스킵
        domesticRows.push({
          date: sidoDate,
          region: s.code, // SidoCode 문자열('01'..'19') 그대로
          fuel_type: product,
          avg_price: price,
          updated_at: nowIso,
        });
        counts.sidoUpserts += 1;
      }
    } catch (e) {
      errors.push(`sido-${product}: ${(e as Error).message}`);
    }
  }

  // market_daily upsert payload — 적어도 한 컬럼이라도 값이 있는 날짜만.
  const marketRows = [...marketByDate.values()]
    .filter((m) => m.dubai != null || m.wti != null || m.brent != null
      || m.mops_gasoline != null || m.mops_diesel != null || m.usdkrw != null)
    .map((m) => ({ ...m, updated_at: nowIso }));

  // ─── upsert (멱등) — 실패해도 기존 데이터 삭제 없음(upsert-only) ───
  let marketUpserts = 0;
  let domesticUpserts = 0;
  try {
    if (marketRows.length > 0) {
      await inChunks(marketRows, UPSERT_CHUNK,
        async (chunk) => await sb.from('market_daily').upsert(chunk, { onConflict: 'date' }),
        'market_daily upsert');
      marketUpserts = marketRows.length;
    }
    if (domesticRows.length > 0) {
      await inChunks(domesticRows, UPSERT_CHUNK,
        async (chunk) => await sb.from('domestic_price_daily').upsert(chunk, { onConflict: 'date,region,fuel_type' }),
        'domestic_price_daily upsert');
      domesticUpserts = domesticRows.length;
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, errors: errors.length ? errors : undefined }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    asOf: nowIso,
    range: { from, to, windowDays },
    sourceCounts: counts,
    marketUpserts,
    domesticUpserts,
    errors: errors.length ? errors : undefined,
  });
}
