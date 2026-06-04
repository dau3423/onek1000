// Supabase 기반 도메인 쿼리 — Supabase 미설정 시 mock 폴백
import { getSupabase, isSupabaseConfigured } from './supabase';
import { PRODUCT_LABEL } from '@/types/station';
import type { StationWithPrice, ProductCode, SidoCode, BrandCode, NationalTop10Item, StationDetail, StationPoint } from '@/types/station';
import type { FuelLog } from '@/types/fuel-log';
import type { Bbox } from '@/lib/map/geo';
import { getMockStations, getMockStationDetail } from '@/lib/mock/stations';
import { distanceMeters, inBbox, topPriceRankMap } from '@/lib/map/geo';
import { fetchStationDetail } from '@/lib/opinet/client';

interface RpcRow {
  id: string; name: string; brand_code: string; is_self: boolean;
  lat: number; lng: number; price: number; trade_dt: string;
  distance_m?: number;
}

export async function queryStationsByBbox(
  bbox: Bbox, product: ProductCode, limit: number,
): Promise<StationWithPrice[]> {
  if (!isSupabaseConfigured()) {
    return getMockStations(product)
      .filter((s) => inBbox(s.lat, s.lng, bbox))
      .sort((a, b) => a.price - b.price)
      .slice(0, limit);
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_stations_by_bbox', {
    p_product: product,
    p_sw_lng: bbox.swLng, p_sw_lat: bbox.swLat,
    p_ne_lng: bbox.neLng, p_ne_lat: bbox.neLat,
    p_limit: limit,
  });
  if (error) throw new Error(`bbox query failed: ${error.message}`);
  return (data as RpcRow[]).map((r) => ({
    id: r.id, name: r.name, brand: (r.brand_code as BrandCode) ?? 'ETC',
    isSelf: r.is_self, sido: '01' as SidoCode, address: '',
    lat: r.lat, lng: r.lng,
    product, price: r.price, tradeDate: r.trade_dt,
  }));
}

interface PointRpcRow {
  id: string; name: string; brand_code: string; is_self: boolean;
  lat: number; lng: number;
}

/**
 * 화면 영역(bbox) 내 "전체 주유소"(가격 유무 무관) — 회색 점(비하이라이트) 렌더용.
 * queryStationsByBbox 는 prices_latest inner join 이라 가격 있는 주유소만 반환하므로,
 * 가격 없는 주유소까지 포함하려면 이 함수(가격 join 없는 RPC)를 쓴다.
 * 줌 게이팅으로 확대 시에만 호출되고 limit 으로 상한을 둔다. Supabase 미설정 시 mock 폴백.
 */
export async function queryStationsInBbox(
  bbox: Bbox, limit: number,
): Promise<StationPoint[]> {
  if (!isSupabaseConfigured()) {
    // mock 에는 유종별 풀만 있으므로 휘발유(B027) 풀의 좌표/브랜드만 점으로 사용한다.
    return getMockStations('B027')
      .filter((s) => inBbox(s.lat, s.lng, bbox))
      .slice(0, limit)
      .map((s) => ({ id: s.id, name: s.name, brand: s.brand, isSelf: s.isSelf, lat: s.lat, lng: s.lng }));
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_stations_in_bbox', {
    p_sw_lng: bbox.swLng, p_sw_lat: bbox.swLat,
    p_ne_lng: bbox.neLng, p_ne_lat: bbox.neLat,
    p_limit: limit,
  });
  if (error) throw new Error(`stations in bbox query failed: ${error.message}`);
  return (data as PointRpcRow[]).map((r) => ({
    id: r.id, name: r.name, brand: (r.brand_code as BrandCode) ?? 'ETC',
    isSelf: r.is_self, lat: r.lat, lng: r.lng,
  }));
}

export async function queryStationsByRadius(
  lat: number, lng: number, radiusM: number,
  product: ProductCode, limit: number,
): Promise<StationWithPrice[]> {
  if (!isSupabaseConfigured()) {
    return getMockStations(product)
      .map((s) => ({ ...s, distance: distanceMeters(lat, lng, s.lat, s.lng) }))
      .filter((s) => (s.distance ?? Infinity) <= radiusM)
      .sort((a, b) => a.price - b.price)
      .slice(0, limit);
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_stations_by_radius', {
    p_lat: lat, p_lng: lng, p_radius_m: radiusM,
    p_product: product, p_limit: limit,
  });
  if (error) throw new Error(`radius query failed: ${error.message}`);
  return (data as RpcRow[]).map((r) => ({
    id: r.id, name: r.name, brand: (r.brand_code as BrandCode) ?? 'ETC',
    isSelf: r.is_self, sido: '01' as SidoCode, address: '',
    lat: r.lat, lng: r.lng,
    product, price: r.price, tradeDate: r.trade_dt,
    distance: r.distance_m,
  }));
}

/** 관심 지역 최저가 TOP10 1건 */
export interface RegionTopRow {
  stationId: string;
  stationName: string;
  price: number;
  rank: number;
}

/**
 * 반경 내 해당 유종 최저가 TOP10(가격 오름차순) 조회 — 관심 지역 변동 감지용.
 * 이 앱의 목적은 "가장 저렴한 주유소 찾기"이므로 가격이 싼 순서대로 상위 10건을 반환한다.
 * Supabase 미설정 시 mock 폴백.
 */
export async function queryRegionTop10(
  lat: number, lng: number, radiusM: number, product: ProductCode,
): Promise<RegionTopRow[]> {
  if (!isSupabaseConfigured()) {
    return getMockStations(product)
      .map((s) => ({ ...s, distance: distanceMeters(lat, lng, s.lat, s.lng) }))
      .filter((s) => (s.distance ?? Infinity) <= radiusM)
      .sort((a, b) => a.price - b.price || (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, 10)
      .map((s, i) => ({ stationId: s.id, stationName: s.name, price: s.price, rank: i + 1 }));
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_region_top10', {
    p_lat: lat, p_lng: lng, p_radius_m: radiusM, p_product: product,
  });
  if (error) throw new Error(`region top10 query failed: ${error.message}`);
  return (data as Array<{ station_id: string; station_name: string; price: number; rank: number }> ?? [])
    .map((r) => ({ stationId: r.station_id, stationName: r.station_name, price: r.price, rank: r.rank }));
}

/**
 * 전국 최저가 TOP10 조회 — 지도 핀/메달 강조 대상 선정용.
 * 화면 영역과 무관하게 해당 유종(product)의 전국 가격 오름차순 상위 10개를 반환한다.
 * 좌표/이름/브랜드를 함께 담아 지도 마커가 보일 때 강조에 사용한다.
 * Supabase 미설정 시 mock 폴백(전국 SEED 기준 TOP10).
 */
export async function queryNationalTop10(
  product: ProductCode,
): Promise<NationalTop10Item[]> {
  if (!isSupabaseConfigured()) {
    const stations = getMockStations(product);
    const rankMap = topPriceRankMap(stations, 10);
    return stations
      .filter((s) => rankMap.has(s.id))
      .map((s) => ({
        id: s.id, name: s.name, brand: s.brand,
        lat: s.lat, lng: s.lng, price: s.price,
        rank: rankMap.get(s.id) as number,
      }))
      .sort((a, b) => a.rank - b.rank);
  }
  const sb = getSupabase();
  // prices_latest를 해당 유종 가격 오름차순으로 상위 10개 뽑고 stations 조인.
  // (product, price) 인덱스를 활용. RPC 없이 PostgREST 조인으로 처리해 경량 유지.
  const { data, error } = await sb
    .from('prices_latest')
    .select('station_id, price, stations!inner(name, brand_code, lat, lng)')
    .eq('product', product)
    .order('price', { ascending: true })
    .limit(10);
  if (error) throw new Error(`national top10 query failed: ${error.message}`);
  type Row = {
    station_id: string;
    price: number;
    stations: { name: string; brand_code: string; lat: number; lng: number }
      | Array<{ name: string; brand_code: string; lat: number; lng: number }>;
  };
  return (data as Row[] ?? []).map((r, i) => {
    const st = Array.isArray(r.stations) ? r.stations[0] : r.stations;
    return {
      id: r.station_id,
      name: st?.name ?? '',
      brand: (st?.brand_code as BrandCode) ?? 'ETC',
      lat: st?.lat ?? 0,
      lng: st?.lng ?? 0,
      price: r.price,
      rank: i + 1,
    };
  });
}

export async function queryStationDetail(id: string): Promise<StationDetail | null> {
  if (!isSupabaseConfigured()) return getMockStationDetail(id) as StationDetail | null;
  const sb = getSupabase();
  const { data: s, error: e1 } = await sb
    .from('stations')
    .select('id, name, brand_code, is_self, sido_code, address, tel, has_carwash, has_cvs, has_maintenance, has_lpg, is_kpetro, amenities_updated_at, is_highway, route_name, direction, lat, lng')
    .eq('id', id)
    .single();
  if (e1 || !s) return null;
  const { data: prices } = await sb
    .from('prices_latest')
    .select('product, price, trade_dt')
    .eq('station_id', id);
  const priceMap: StationDetail['prices'] = {
    B027: null, B034: null, D047: null, K015: null, C004: null,
  };
  for (const p of prices ?? []) {
    if ((p.product as ProductCode) in priceMap) {
      priceMap[p.product as ProductCode] = { price: p.price, tradeDate: p.trade_dt };
    }
  }
  return {
    id: s.id, name: s.name, brand: (s.brand_code as BrandCode) ?? 'ETC',
    isSelf: s.is_self, sido: (s.sido_code as SidoCode) ?? '01',
    address: s.address ?? '', tel: s.tel ?? undefined,
    hasCarwash: !!s.has_carwash, hasCvs: !!s.has_cvs, hasMaintenance: !!s.has_maintenance,
    hasLpg: !!s.has_lpg, isKpetro: !!s.is_kpetro,
    amenitiesUpdatedAt: s.amenities_updated_at ?? null,
    isHighway: !!s.is_highway,
    routeName: s.route_name ?? null,
    direction: s.direction ?? null,
    lat: s.lat ?? 0, lng: s.lng ?? 0,
    prices: priceMap,
  };
}

/** detail.prices 안에 실제 가격(유종 1개라도)이 있는지 */
function hasAnyPrice(detail: StationDetail): boolean {
  return Object.values(detail.prices).some((v) => v != null);
}

/** Promise에 타임아웃을 거는 헬퍼 — 초과 시 reject. (Opinet 지연/할당량 소진 대비) */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// 전체 적재 시 가격이 아직 없는 주유소는 상세 진입 시 Opinet detailById 1회로 가격을 채운다.
// "상세=DB only" 원칙을 가격이 전무할 때에만 완화하고, 받은 가격은 DB(prices_latest)에 캐시해
// 다음 진입부터는 DB만으로 표시되게 한다(재호출 최소화). Opinet 호출은 짧은 타임아웃으로 보호하고,
// 실패/할당량 소진/빈 응답이면 DB 스냅샷(가격 없으면 '정보 없음')으로 폴백해 페이지가 깨지지 않게 한다.
const DETAIL_OPINET_TIMEOUT_MS = 7000;

/**
 * 상세 페이지용 주유소 조회. DB 우선 조회 후, 가격이 하나도 없으면(전체 적재로 새로
 * 들어온 주유소 등) Opinet detailById를 1회 실시간 호출해 가격(+부가서비스)을 채우고
 * DB에 캐시한다. 가격이 이미 있으면 Opinet을 호출하지 않아 기존 동작/속도가 불변이다.
 */
export async function queryStationDetailWithPriceFallback(id: string): Promise<StationDetail | null> {
  const base = await queryStationDetail(id);
  if (!base) return null;

  // 가격이 이미 있거나, Supabase 미설정(mock 모드)이면 그대로 반환 — Opinet 미호출.
  if (!isSupabaseConfigured() || hasAnyPrice(base)) return base;

  // 가격 전무 → Opinet detailById 1회 실시간 조회(짧은 타임아웃). 실패/빈 응답이면 DB 스냅샷 폴백.
  let live: StationDetail | null = null;
  try {
    live = await withTimeout(fetchStationDetail(id), DETAIL_OPINET_TIMEOUT_MS, 'opinet detail');
  } catch {
    return base; // 타임아웃/네트워크/할당량 → DB값으로 폴백(가격 미표시)
  }
  if (!live || !hasAnyPrice(live)) return base; // 빈 응답(OIL[])도 폴백

  // 받은 가격을 base에 머지(부가서비스는 Opinet 응답이 더 신선하면 보강).
  const merged: StationDetail = {
    ...base,
    prices: { ...base.prices, ...live.prices },
    hasCarwash: live.hasCarwash ?? base.hasCarwash,
    hasCvs: live.hasCvs ?? base.hasCvs,
    hasMaintenance: live.hasMaintenance ?? base.hasMaintenance,
  };

  // DB 캐시(prices_latest upsert). 실패해도 표시에는 영향 없게 best-effort.
  await cacheStationPrices(id, live).catch(() => {});

  return merged;
}

interface MyFuelLogRow {
  id: string;
  kind: string | null;
  station_id: string;
  station_name: string;
  product: string;
  unit_price: number | null;
  amount_won: number | null;
  liters: number | string | null;
  kwh: number | string | null;
  odometer: number | null;
  memo: string | null;
  logged_at: string;
  created_at: string;
}

/**
 * 로그인 사용자의 "특정 주유소" 주유 기록(최신순). 주유소 상세의 "내 주유 기록" 섹션용.
 * 진입 경로(메인 지도/마이페이지 지도)와 무관하게 상세 페이지에서 직접 조회한다.
 * email→userId 해석 후 본인(user_id) + 해당 station_id 만 조회(소유자 스코프).
 * Supabase 미설정(mock) 또는 비로그인/사용자 없음이면 빈 배열.
 */
export async function queryMyFuelLogsAtStation(email: string, stationId: string, limit = 10): Promise<FuelLog[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data: u } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  const userId = u?.id;
  if (!userId) return [];

  const { data } = await sb
    .from('fuel_logs')
    .select('id, kind, station_id, station_name, product, unit_price, amount_won, liters, kwh, odometer, memo, logged_at, created_at')
    .eq('user_id', userId)
    .eq('station_id', stationId)
    .order('logged_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as MyFuelLogRow[]).map((r) => ({
    id: r.id,
    kind: r.kind === 'ev' ? 'ev' : 'gas',
    stationId: r.station_id,
    stationName: r.station_name,
    product: (r.product as ProductCode) in PRODUCT_LABEL ? (r.product as ProductCode) : 'B027',
    unitPrice: r.unit_price,
    amountWon: r.amount_won,
    liters: r.liters === null ? null : Number(r.liters),
    kwh: r.kwh === null ? null : Number(r.kwh),
    odometer: r.odometer,
    memo: r.memo,
    loggedAt: r.logged_at,
    createdAt: r.created_at,
  }));
}

/** Opinet detailById로 받은 가격을 prices_latest에 upsert(+stations 부가서비스 보강). best-effort. */
async function cacheStationPrices(id: string, live: StationDetail): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  const now = new Date().toISOString();
  const rows = (Object.entries(live.prices) as Array<[ProductCode, { price: number; tradeDate: string } | null]>)
    .filter(([, v]) => v != null)
    .map(([product, v]) => ({
      station_id: id,
      product,
      price: v!.price,
      trade_dt: v!.tradeDate || now.slice(0, 10),
      updated_at: now,
    }));
  if (rows.length === 0) return;
  await sb.from('prices_latest').upsert(rows, { onConflict: 'station_id,product' });

  // 부가서비스도 한 번 받은 김에 보강(아직 미보강이면 채워두면 다음 진입에 안내문구 대신 노출).
  await sb.from('stations').update({
    has_carwash: live.hasCarwash ?? null,
    has_cvs: live.hasCvs ?? null,
    has_maintenance: live.hasMaintenance ?? null,
    amenities_updated_at: now,
  }).eq('id', id);
}
