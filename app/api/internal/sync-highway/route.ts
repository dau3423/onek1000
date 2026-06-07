// Cron (1일 1회) — 한국도로공사 고속도로(휴게소) 주유소 가격/위치 동기화.
// Authorization: Bearer ${CRON_SECRET}
//
// Opinet 가격 sync(sync-opinet)는 "시군구별 최저가 TOP10"만 수집해 고속도로 휴게소 주유소가
// 대부분 누락된다. 이 라우트가 도로공사 curStateStation API로 고속도로 주유소를 별도 적재한다.
// 1일 1회 정책(sync-opinet과 동일)에 맞춰 별도 cron으로 호출한다.
//
// 좌표: 가격 API에는 위경도가 없으므로 svarAddr(주소)를 카카오 지오코딩으로 1회 변환해 저장한다.
//   - 이미 좌표가 있는(이전 sync에서 확보) 휴게소는 재지오코딩하지 않아 카카오 호출을 아낀다.
//   - 좌표를 못 구한 휴게소는 적재 보류(지도 미표시)하고 로그만 남긴다.
// 외부 API(도로공사/카카오)는 이 sync에서만 호출한다(상세/조회 실시간 호출 금지).
//
// graceful skip: USE_MOCK / Supabase 미설정 / EX_API_KEY 미설정 시 skip(기존 Opinet sync는 정상 동작).

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { fetchAllHighwayStations, isExoilConfigured } from '@/lib/exoil/client';
import { geocode, isGeocodeConfigured } from '@/lib/geocode/kakao';
import { BRAND_LABEL, type ProductCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 도로공사 휴게소 주유소는 'EX-' + serviceAreaCode2 로 적재해 Opinet UNI_ID 와 충돌하지 않게 한다.
// 콜론(':')은 Firebase App Hosting(Google LB/CDN)에서 /station/EX:000297 경로를 깨뜨려 404가 나므로
// (raw/인코딩 모두) unreserved 문자인 하이픈을 쓴다. 실제 적재는 서울 Cloud Run(services/highway-sync).
const EX_ID_PREFIX = 'EX-';
// 고속도로 구분 브랜드 코드(types/station.ts BrandCode 'EXP' 와 일치). 정유사 oilCompany 는 별도 매핑하지 않는다.
const EX_BRAND = 'EXP';
// 고속도로 주유소는 행정구역 sido 코드를 알 수 없어 비공간 컬럼은 NOT NULL 충족용 폴백값을 둔다.
// (조회/지도는 geom/lat/lng 기준이라 sido_code 값에 의존하지 않는다.)
const EX_SIDO_FALLBACK = '02'; // 경기(임의 폴백) — 화면/검색은 좌표 기반이라 영향 없음

const UPSERT_CHUNK = 500;
// 카카오 지오코딩 호출 간 짧은 간격(과호출 방지).
const GEOCODE_DELAY_MS = 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// === 가격 sanity 가드 상수(services/highway-sync/sync.js 와 동일 규칙) ===
// 도로공사 원본 이상값(예: 휘발유 1,198원 — 정상 1,998원)이 잘못 적재되는 걸 막는다.
// 가드에 걸린 유종은 prices_latest upsert에서 제외(=기존값 유지)하고, prices_history엔 원시값을 항상 기록.
const PRODUCT_LPG = 'C004'; // LPG
// 가드1(관계형): 휘발유/경유는 한국에서 항상 LPG보다 비싸다. LPG가 있는데 gas <= lpg 면 그 유종은 오류.
const RELATIONAL_PRODUCTS: ProductCode[] = ['B027', 'D047']; // 휘발유, 경유
// 가드2(급변): 새 값이 직전값 대비 ±30% 초과 변동이면 급변 의심.
const CHANGE_THRESHOLD = 0.3;
// 급변이어도 최근 history에 새 값과 ±3% 이내 근접 reading이 있으면 실제 추세로 수용.
const HISTORY_MATCH_TOL = 0.03;
// history 추세 확인 시 station+product별로 살펴볼 최근 reading 개수.
const HISTORY_LOOKBACK = 3;

type GuardLog = { station_id: string; product: ProductCode; new: number; prev: number | null; reason: string };
type PriceCand = { station_id: string; product: ProductCode; price: number };

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured() || !isExoilConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'mock mode / supabase or EX_API_KEY missing' });
  }

  const sb = getSupabase();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const errors: string[] = [];

  // 1) 도로공사 가격 API 전량 수집(모든 페이지). 가격 없는 행은 client에서 제외됨.
  let highway;
  try {
    highway = await fetchAllHighwayStations();
  } catch (e) {
    return NextResponse.json({ error: `ex fetch failed: ${(e as Error).message}` }, { status: 502 });
  }
  if (highway.length === 0) {
    return NextResponse.json({ ok: true, asOf: now, fetched: 0, note: 'no highway stations returned' });
  }

  // 2) 기존 EX 좌표 캐시 — 이미 좌표가 있는 휴게소는 재지오코딩하지 않는다(카카오 호출 절약).
  const ids = highway.map((h) => EX_ID_PREFIX + h.code);
  const coordCache = new Map<string, { lat: number; lng: number }>();
  // 가드2(급변)용 직전 저장값 — `${station_id} ${product}` → price.
  const prevPriceMap = new Map<string, number>();
  {
    // id IN (...) 조회는 대량이면 청크로 나눠 안전하게.
    for (let i = 0; i < ids.length; i += UPSERT_CHUNK) {
      const chunk = ids.slice(i, i + UPSERT_CHUNK);
      const { data } = await sb
        .from('stations')
        .select('id, lat, lng')
        .in('id', chunk);
      for (const r of data ?? []) {
        if (r.lat != null && r.lng != null) coordCache.set(r.id as string, { lat: r.lat, lng: r.lng });
      }
    }
    // 직전 prices_latest 일괄 조회(이번 sync 대상 EX station들만). 메모리에서 급변 판정.
    for (let i = 0; i < ids.length; i += UPSERT_CHUNK) {
      const chunk = ids.slice(i, i + UPSERT_CHUNK);
      const { data } = await sb
        .from('prices_latest')
        .select('station_id, product, price')
        .in('station_id', chunk);
      for (const r of data ?? []) {
        if (r.price != null) prevPriceMap.set(`${r.station_id} ${r.product}`, Number(r.price));
      }
    }
  }

  // 가드2 보완: 급변 의심 건만 prices_history 최근 reading을 모아 추세 확인용으로 조회한다.
  // (전 station을 다 긁지 않고 실제 급변에 걸린 station만 대상으로 효율화. 인덱스: station_id,product,observed_at)
  const fetchRecentHistory = async (pairs: PriceCand[]): Promise<Map<string, number[]>> => {
    const map = new Map<string, number[]>();
    if (pairs.length === 0) return map;
    const stationIds = [...new Set(pairs.map((p) => p.station_id))];
    for (let i = 0; i < stationIds.length; i += UPSERT_CHUNK) {
      const chunk = stationIds.slice(i, i + UPSERT_CHUNK);
      const { data } = await sb
        .from('prices_history')
        .select('station_id, product, price, observed_at')
        .in('station_id', chunk)
        .order('observed_at', { ascending: false });
      for (const r of data ?? []) {
        if (r.price == null) continue;
        const k = `${r.station_id} ${r.product}`;
        const arr = map.get(k) ?? [];
        if (arr.length < HISTORY_LOOKBACK) arr.push(Number(r.price));
        map.set(k, arr);
      }
    }
    return map;
  };

  // 3) 좌표 확보(없는 건만 지오코딩) + station/price 행 구성.
  const stationRows: Record<string, unknown>[] = [];
  const priceRows: Record<string, unknown>[] = []; // 최종 prices_latest upsert 대상(가드 통과분).
  const history: Array<{ station_id: string; product: ProductCode; price: number }> = []; // 원시 reading(항상 insert).
  const latestCandidates: PriceCand[] = []; // 관계형 통과분 — 급변 가드 후 priceRows로 확정.
  const guarded: GuardLog[] = []; // 가드로 latest에서 제외된 건(모니터링 로그).
  const geocodeEnabled = isGeocodeConfigured();
  let geocoded = 0;
  let coordSkipped = 0;
  let coordCached = 0;

  for (const h of highway) {
    const id = EX_ID_PREFIX + h.code;
    let coord = coordCache.get(id) ?? null;
    if (coord) {
      coordCached++;
    } else if (geocodeEnabled) {
      coord = await geocode(h.address, h.name);
      if (coord) geocoded++;
      await sleep(GEOCODE_DELAY_MS);
    }

    // 좌표를 못 구한 휴게소는 적재 보류(NOT NULL geom 충족 불가 + 지도 표시 불가).
    if (!coord) {
      coordSkipped++;
      continue;
    }

    stationRows.push({
      id,
      brand_code: EX_BRAND,
      brand_name: BRAND_LABEL.EXP,
      name: h.name,
      sido_code: EX_SIDO_FALLBACK,
      sigungu_code: null,
      address: h.address,
      tel: h.tel,
      is_self: false,
      is_highway: true,
      route_name: h.routeName,
      direction: h.direction,
      lat: coord.lat,
      lng: coord.lng,
      geom: `SRID=4326;POINT(${coord.lng} ${coord.lat})`,
      updated_at: now,
    });

    // prices_history엔 원시 reading을 항상 기록(가드로 latest를 막아도 추세는 누적되어
    // 다음 회차에 진짜 변동이 history 확인으로 수용된다).
    for (const [product, price] of Object.entries(h.prices) as Array<[ProductCode, number]>) {
      history.push({ station_id: id, product, price });
    }

    // === 가드1(관계형) ===: LPG가 있는데 휘발유/경유가 LPG 이하면 그 유종은 오류 → latest 제외.
    const prices = h.prices as Record<ProductCode, number>;
    const lpg = prices[PRODUCT_LPG as ProductCode];
    const skippedProducts = new Set<ProductCode>();
    if (lpg != null) {
      for (const product of RELATIONAL_PRODUCTS) {
        const v = prices[product];
        if (v != null && v <= lpg) {
          skippedProducts.add(product);
          guarded.push({ station_id: id, product, new: v, prev: prevPriceMap.get(`${id} ${product}`) ?? null, reason: `relational(<=lpg ${lpg})` });
        }
      }
    }

    // 관계형 통과분만 latest 후보로 둔다. 급변 가드는 history 조회 후 일괄 판정(아래).
    for (const [product, price] of Object.entries(h.prices) as Array<[ProductCode, number]>) {
      if (skippedProducts.has(product)) continue;
      latestCandidates.push({ station_id: id, product, price });
    }
  }

  if (coordSkipped) errors.push(`coord skipped(no geocode): ${coordSkipped}`);

  // === 가드2(급변): 직전값 대비 ±30% 초과 변동 건만 후보로 추려, history 추세로 수용/스킵 판정 ===
  // 직전값이 없으면(신규 주유소) 급변 가드 미적용(관계형만).
  const surgeSuspects: Array<PriceCand & { prev: number }> = [];
  const candidateKept: PriceCand[] = [];
  for (const c of latestCandidates) {
    const prev = prevPriceMap.get(`${c.station_id} ${c.product}`);
    if (prev == null || prev <= 0) {
      candidateKept.push(c); // 신규: 급변 가드 미적용.
      continue;
    }
    const change = Math.abs(c.price - prev) / prev;
    if (change > CHANGE_THRESHOLD) surgeSuspects.push({ ...c, prev });
    else candidateKept.push(c);
  }

  // 급변 의심 건만 최근 history를 조회해, 새 값과 ±3% 근접 reading이 이미 있으면 실제 추세로 수용.
  const recentHistory = surgeSuspects.length > 0 ? await fetchRecentHistory(surgeSuspects) : new Map<string, number[]>();
  for (const s of surgeSuspects) {
    const readings = recentHistory.get(`${s.station_id} ${s.product}`) ?? [];
    // 이번 회차 원시 reading은 아직 insert 전이라 history엔 없다(직전 회차들만 비교) → 의도된 동작.
    const matched = readings.some((r) => r > 0 && Math.abs(s.price - r) / r <= HISTORY_MATCH_TOL);
    if (matched) {
      candidateKept.push({ station_id: s.station_id, product: s.product, price: s.price });
    } else {
      // 첫 등장 글리치로 보고 latest 갱신 스킵(기존값 유지). history엔 이미 원시값 기록됨.
      guarded.push({ station_id: s.station_id, product: s.product, new: s.price, prev: s.prev, reason: `surge(>${CHANGE_THRESHOLD * 100}%, no history match)` });
    }
  }

  // 가드 통과분만 prices_latest upsert payload로 확정.
  for (const c of candidateKept) {
    priceRows.push({ station_id: c.station_id, product: c.product, price: c.price, trade_dt: today, updated_at: now });
  }

  const guardedCount = guarded.length;
  if (guardedCount) errors.push(`price guard skipped(latest kept): ${guardedCount}`);

  if (stationRows.length === 0) {
    return NextResponse.json({
      ok: true, asOf: now, fetched: highway.length,
      stationUpserts: 0, priceUpserts: 0, coordSkipped, guardedCount,
      note: geocodeEnabled ? 'all geocode failed' : 'geocode key missing (KAKAO_REST_API_KEY)',
      errors: errors.length ? errors : undefined,
    });
  }

  // 4) UPSERT — stations 먼저(가격 FK가 stations.id 참조), 그 다음 prices_latest/history.
  const inChunks = async (
    rows: Record<string, unknown>[],
    fn: (chunk: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>,
    label: string,
  ) => {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK);
      const { error } = await fn(chunk);
      if (error) throw new Error(`${label} failed (rows ${i}-${i + chunk.length}): ${error.message}`);
    }
  };

  try {
    await inChunks(stationRows,
      async (chunk) => await sb.from('stations').upsert(chunk, { onConflict: 'id' }),
      'stations upsert');
    await inChunks(priceRows,
      async (chunk) => await sb.from('prices_latest').upsert(chunk, { onConflict: 'station_id,product' }),
      'prices_latest upsert');
    await inChunks(history as unknown as Record<string, unknown>[],
      async (chunk) => await sb.from('prices_history').insert(chunk),
      'prices_history insert');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    asOf: now,
    fetched: highway.length,
    stationUpserts: stationRows.length,
    priceUpserts: priceRows.length,
    geocoded, coordCached, coordSkipped,
    guardedCount,
    guarded: guarded.slice(0, 50), // 모니터링용 사례 샘플(과다 로그 방지 상한).
    errors: errors.length ? errors : undefined,
  });
}
