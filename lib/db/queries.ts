// Supabase 기반 도메인 쿼리 — Supabase 미설정 시 mock 폴백
import { getSupabase, isSupabaseConfigured } from './supabase';
import { PRODUCT_LABEL } from '@/types/station';
import type { StationWithPrice, ProductCode, SidoCode, BrandCode, NationalTop10Item, DailyTop10Item, StationDetail, StationPoint } from '@/types/station';
import type { FuelLog } from '@/types/fuel-log';
import type { Bbox } from '@/lib/map/geo';
import { getMockStations, getMockStationDetail } from '@/lib/mock/stations';
import { distanceMeters, inBbox, topPriceRankMap } from '@/lib/map/geo';
import { fetchStationDetail } from '@/lib/opinet/client';
import { redis, keys } from '@/lib/cache/redis';

interface RpcRow {
  id: string; name: string; brand_code: string; is_self: boolean;
  lat: number; lng: number; price: number; trade_dt: string;
  distance_m?: number;
}

export async function queryStationsByBbox(
  bbox: Bbox, product: ProductCode, limit: number,
  // 단일 브랜드만 조회할 때 지정(예: 'EXP'=고속도로만). 지정 시 그 브랜드만 limit 안에 담아
  // 줌 아웃(넓은 bbox)에서도 가격 상한에 밀려 누락되지 않게 한다. 미지정이면 기존 동작(전체).
  brand?: BrandCode,
): Promise<StationWithPrice[]> {
  if (!isSupabaseConfigured()) {
    return getMockStations(product)
      .filter((s) => inBbox(s.lat, s.lng, bbox))
      .filter((s) => (brand ? s.brand === brand : true))
      .sort((a, b) => a.price - b.price)
      .slice(0, limit);
  }
  const sb = getSupabase();
  // 브랜드 지정 시 brand 필터 RPC(0021)로 그 브랜드만 조회한다. 미지정이면 기존 RPC 그대로.
  const { data, error } = brand
    ? await sb.rpc('rpc_stations_by_bbox_brand', {
        p_product: product, p_brand: brand,
        p_sw_lng: bbox.swLng, p_sw_lat: bbox.swLat,
        p_ne_lng: bbox.neLng, p_ne_lat: bbox.neLat,
        p_limit: limit,
      })
    : await sb.rpc('rpc_stations_by_bbox', {
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

/** 지역 가격 추세(④ 타이밍 배너용) — 어떤 지점 반경의 최근 7일 vs 직전 7일 평균가 비교 */
export type TrendDir = 'up' | 'down' | 'flat';
export interface PriceTrend {
  /** 'up'=오름세, 'down'=내림세, 'flat'=보합. 데이터 부족이면 null */
  trend: TrendDir | null;
  /** 변동률(%) — (recent-prior)/prior*100. 데이터 부족이면 null */
  changePct: number | null;
  /** 최근 7일 평균가(원/L) */
  recentAvg: number | null;
  /** 직전 7일 평균가(원/L) */
  priorAvg: number | null;
  /** 표본 수 — 임계/신뢰 판정용 */
  recentN: number;
  priorN: number;
  /** 산출 근거 라벨(반환 디버깅·UI 보조용) */
  basis: string;
}

// 추세 판정 임계 — |변동률| 이 이 값 미만이면 'flat'(보합)으로 본다.
const TREND_FLAT_PCT = 0.3;
// 추세를 신뢰하기 위한 최소 표본 수(두 구간 모두 충족해야 방향 판정).
const TREND_MIN_SAMPLES = 3;

/**
 * 지점 반경의 가격 추세 산출 — 최근 7일 평균 vs 직전 7일 평균(prices_history).
 * 외부 API 호출 없이 우리 DB만 사용. Supabase 미설정 시 mock 폴백(항상 'flat').
 * 데이터 부족(표본 부족/평균 없음)이면 trend=null 로 반환해 배너 미표시를 유도한다.
 */
export async function queryPriceTrend(
  lat: number, lng: number, radiusM: number, product: ProductCode,
): Promise<PriceTrend> {
  const empty: PriceTrend = {
    trend: null, changePct: null, recentAvg: null, priorAvg: null,
    recentN: 0, priorN: 0, basis: '최근 7일 vs 직전 7일',
  };

  // Mock 모드: 이력 표본이 없으므로 추세 미산출(보합으로 간주, 배너 미표시).
  if (!isSupabaseConfigured()) return empty;

  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_price_trend', {
    p_lat: lat, p_lng: lng, p_radius_m: radiusM, p_product: product,
  });
  if (error) throw new Error(`price trend query failed: ${error.message}`);

  const row = (data as Array<{
    recent_avg: number | null; prior_avg: number | null;
    recent_n: number | string; prior_n: number | string;
  }> | null)?.[0];
  if (!row) return empty;

  const recentAvg = row.recent_avg == null ? null : Number(row.recent_avg);
  const priorAvg = row.prior_avg == null ? null : Number(row.prior_avg);
  const recentN = Number(row.recent_n ?? 0);
  const priorN = Number(row.prior_n ?? 0);

  // 표본/평균 부족 시 방향 판정 불가 → null(배너 미표시).
  if (recentAvg == null || priorAvg == null || priorAvg <= 0) {
    return { ...empty, recentAvg, priorAvg, recentN, priorN };
  }
  if (recentN < TREND_MIN_SAMPLES || priorN < TREND_MIN_SAMPLES) {
    return { ...empty, recentAvg, priorAvg, recentN, priorN };
  }

  const changePct = ((recentAvg - priorAvg) / priorAvg) * 100;
  const trend: TrendDir =
    Math.abs(changePct) < TREND_FLAT_PCT ? 'flat' : changePct > 0 ? 'up' : 'down';

  return {
    trend,
    changePct: Number(changePct.toFixed(2)),
    recentAvg: Math.round(recentAvg),
    priorAvg: Math.round(priorAvg),
    recentN, priorN,
    basis: '최근 7일 vs 직전 7일',
  };
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

/**
 * SNS 게시(매일 복붙/이미지) 전용 전국 최저가 TOP10.
 * queryNationalTop10과 동일한 "전국 가격 오름차순 상위 10" 의미지만,
 * 게시 문구/표에 필요한 지역(sido)·셀프여부를 함께 담는다.
 * Supabase 미설정 시 mock 폴백(전국 SEED 기준 TOP10).
 */
export async function queryDailyTop10(
  product: ProductCode,
): Promise<DailyTop10Item[]> {
  if (!isSupabaseConfigured()) {
    return getMockStations(product)
      .slice()
      .sort((a, b) => a.price - b.price)
      .slice(0, 10)
      .map((s, i) => ({
        rank: i + 1, id: s.id, name: s.name, brand: s.brand,
        sido: s.sido, isSelf: s.isSelf, price: s.price,
      }));
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('prices_latest')
    .select('station_id, price, stations!inner(name, brand_code, sido_code, is_self)')
    .eq('product', product)
    .order('price', { ascending: true })
    .limit(10);
  if (error) throw new Error(`daily top10 query failed: ${error.message}`);
  type Row = {
    station_id: string;
    price: number;
    stations:
      | { name: string; brand_code: string; sido_code: string; is_self: boolean }
      | Array<{ name: string; brand_code: string; sido_code: string; is_self: boolean }>;
  };
  return (data as Row[] ?? []).map((r, i) => {
    const st = Array.isArray(r.stations) ? r.stations[0] : r.stations;
    return {
      rank: i + 1,
      id: r.station_id,
      name: st?.name ?? '',
      brand: (st?.brand_code as BrandCode) ?? 'ETC',
      sido: (st?.sido_code as SidoCode) ?? '01',
      isSelf: !!st?.is_self,
      price: r.price,
    };
  });
}

/**
 * 특정 시도(sido)의 해당 유종 최저가 TOP10 — SEO 지역 랜딩 페이지용.
 * queryDailyTop10과 동일하게 "가격 오름차순 상위 10"이되, stations.sido_code로 지역을 한정한다.
 * Supabase 미설정 시 mock 폴백(해당 sido만 필터).
 */
export async function queryRegionDailyTop10(
  sido: SidoCode,
  product: ProductCode,
  limit = 10,
): Promise<DailyTop10Item[]> {
  if (!isSupabaseConfigured()) {
    return getMockStations(product)
      .filter((s) => s.sido === sido)
      .sort((a, b) => a.price - b.price)
      .slice(0, limit)
      .map((s, i) => ({
        rank: i + 1, id: s.id, name: s.name, brand: s.brand,
        sido: s.sido, isSelf: s.isSelf, price: s.price,
      }));
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('prices_latest')
    .select('station_id, price, stations!inner(name, brand_code, sido_code, is_self)')
    .eq('product', product)
    .eq('stations.sido_code', sido)
    .order('price', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`region daily top10 query failed: ${error.message}`);
  type Row = {
    station_id: string;
    price: number;
    stations:
      | { name: string; brand_code: string; sido_code: string; is_self: boolean }
      | Array<{ name: string; brand_code: string; sido_code: string; is_self: boolean }>;
  };
  return (data as Row[] ?? []).map((r, i) => {
    const st = Array.isArray(r.stations) ? r.stations[0] : r.stations;
    return {
      rank: i + 1,
      id: r.station_id,
      name: st?.name ?? '',
      brand: (st?.brand_code as BrandCode) ?? 'ETC',
      sido: (st?.sido_code as SidoCode) ?? sido,
      isSelf: !!st?.is_self,
      price: r.price,
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
// "상세=DB only" 원칙을 가격이 전무할 때에만 완화한다. 단, 받은 가격은 prices_latest에 쓰지 않고
// 별도 Redis 캐시(detailPrice)에만 저장한다 — prices_latest에 적재하면 지도 bbox/마커가 이 주유소를
// '가격 있는 일반 마커'로 바꿔 비순위 마커가 사라지기 때문이다(마커 불변 보장). Opinet 호출은 짧은
// 타임아웃으로 보호하고, 실패/할당량 소진/빈 응답이면 전역 쿨다운 플래그를 세워 이후 헛호출을 차단한다.
const DETAIL_OPINET_TIMEOUT_MS = 7000;
// Opinet 무효/실패 응답 후 전역 쿨다운(분). 이 동안 상세 조회는 Opinet을 호출하지 않는다.
const DETAIL_COOLDOWN_MIN = 30;

/** 현재 시각 기준 다음 KST(UTC+9) 자정까지 남은 초. 최소 60초 가드. (가격 캐시 TTL용) */
function secondsUntilKstMidnight(): number {
  const KST_OFFSET_MS = 9 * 3600 * 1000;
  const nowKst = Date.now() + KST_OFFSET_MS;
  const dayMs = 24 * 3600 * 1000;
  const sinceMidnight = ((nowKst % dayMs) + dayMs) % dayMs; // KST 자정 이후 경과 ms
  const remainMs = dayMs - sinceMidnight;
  return Math.max(60, Math.floor(remainMs / 1000));
}

/**
 * 상세 페이지용 주유소 조회. DB 우선 조회 후, 가격이 하나도 없으면(전체 적재로 새로
 * 들어온 주유소 등) on-demand로 가격을 채운다. 우선순위:
 *   a. DB 가격 있으면 그대로(Opinet 미호출)
 *   b. Supabase 미설정(mock) → base 그대로(Opinet 미호출)
 *   c. Redis 가격 캐시(detailPrice) 히트 → 머지 반환(Opinet 미호출)
 *   d. 캐시 미스 & 쿨다운 없음 → Opinet detailById 1회(짧은 타임아웃)
 *        - 유효 → 머지 + Redis 가격 캐시(KST 자정까지) + (미보강 시)부가서비스 보강
 *        - 무효/빈/타임아웃 → base 그대로 + 전역 쿨다운 플래그 set
 *   e. 쿨다운 플래그 있으면 → base 그대로(Opinet 미호출)
 * 어느 경로든 가격은 절대 prices_latest에 쓰지 않아 지도 마커가 불변이다.
 */
export async function queryStationDetailWithPriceFallback(id: string): Promise<StationDetail | null> {
  const base = await queryStationDetail(id);
  if (!base) return null;

  // a/b. 가격이 이미 있거나 Supabase 미설정(mock)이면 그대로 반환 — Opinet 미호출.
  if (!isSupabaseConfigured() || hasAnyPrice(base)) return base;

  // c. Redis 가격 캐시 히트 → 그 가격을 머지해 반환(Opinet 미호출).
  const cached = await redis.getJson<StationDetail['prices']>(keys.detailPrice(id));
  if (cached) {
    return { ...base, prices: { ...base.prices, ...cached } };
  }

  // e. 전역 쿨다운(소진) 상태면 Opinet 호출 없이 base 그대로.
  const cooling = await redis.getJson<number>(keys.detailPriceCooldown());
  if (cooling) return base;

  // d. 캐시 미스 & 쿨다운 없음 → Opinet detailById 1회 실시간 조회(짧은 타임아웃).
  let live: StationDetail | null = null;
  try {
    live = await withTimeout(fetchStationDetail(id), DETAIL_OPINET_TIMEOUT_MS, 'opinet detail');
  } catch {
    live = null; // 타임아웃/네트워크/할당량
  }
  if (!live || !hasAnyPrice(live)) {
    // 무효/빈/타임아웃 → 전역 쿨다운 플래그 set 후 base 폴백(이후 d 단락).
    await redis.setJson(keys.detailPriceCooldown(), 1, DETAIL_COOLDOWN_MIN * 60);
    return base;
  }

  // 유효 → 가격만 Redis 캐시(KST 자정까지). prices_latest에는 절대 쓰지 않는다.
  await redis.setJson(keys.detailPrice(id), live.prices, secondsUntilKstMidnight());

  // 부가서비스는 아직 미보강(amenities_updated_at null)일 때만 stations에 보강(best-effort).
  if (base.amenitiesUpdatedAt == null) {
    await cacheStationAmenities(id, live).catch(() => {});
  }

  // 받은 가격을 base에 머지해 표시.
  return { ...base, prices: { ...base.prices, ...live.prices } };
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

/**
 * 로그인 사용자의 "전체" 주유/충전 기록(최신순) — 차계부 리포트 집계용.
 * email→userId 해석 후 본인(user_id) 기록만 조회(소유자 스코프).
 * @param sinceIso 이 시각(포함) 이후 logged_at 만. null이면 전체.
 * @param limit 안전 상한(기본 2000건). 집계는 클라/서버 메모리에서 수행.
 * Supabase 미설정(mock) 또는 비로그인/사용자 없음이면 빈 배열.
 */
export async function queryMyFuelLogs(
  email: string,
  sinceIso: string | null = null,
  limit = 2000,
): Promise<FuelLog[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data: u } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  const userId = u?.id;
  if (!userId) return [];

  let q = sb
    .from('fuel_logs')
    .select('id, kind, station_id, station_name, product, unit_price, amount_won, liters, kwh, odometer, memo, logged_at, created_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(limit);
  if (sinceIso) q = q.gte('logged_at', sinceIso);
  const { data } = await q;

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

/**
 * 유종별 "현재 전국 평균가"(원/L) — 리포트의 절약 추정 기준선.
 * 우리 DB(prices_latest)만 집계한다(외부 API 호출 없음). 시점별 히스토리가 없어 현재값으로 근사한다.
 * Supabase 미설정 시 빈 객체(→ 절약 추정 비활성).
 */
export async function queryNationalAvgPrices(): Promise<Partial<Record<ProductCode, number>>> {
  if (!isSupabaseConfigured()) return {};
  const sb = getSupabase();
  // prices_latest 전체에서 유종별 평균을 클라 집계(전국 주유소 ~1.1만개 × 유종, 가벼운 단일 컬럼 조회).
  const { data } = await sb.from('prices_latest').select('product, price');
  if (!data) return {};
  const sum: Record<string, { total: number; n: number }> = {};
  for (const row of data as Array<{ product: string; price: number }>) {
    const p = row.product;
    if (!sum[p]) sum[p] = { total: 0, n: 0 };
    sum[p].total += row.price;
    sum[p].n += 1;
  }
  const out: Partial<Record<ProductCode, number>> = {};
  for (const [p, v] of Object.entries(sum)) {
    if ((p as ProductCode) in PRODUCT_LABEL && v.n > 0) {
      out[p as ProductCode] = Math.round(v.total / v.n);
    }
  }
  return out;
}

/**
 * Opinet detailById로 받은 부가서비스(세차/편의점/정비)를 stations에 보강(best-effort).
 * 가격은 여기서 다루지 않는다(지도 마커 불변을 위해 prices_latest에 쓰지 않음).
 * hasLpg/isKpetro는 fetchStationDetail이 매핑하지 않아(undefined) 건드리지 않는다 — sync 보강과 동일 컬럼셋만.
 */
async function cacheStationAmenities(id: string, live: StationDetail): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  const now = new Date().toISOString();
  await sb.from('stations').update({
    has_carwash: live.hasCarwash ?? null,
    has_cvs: live.hasCvs ?? null,
    has_maintenance: live.hasMaintenance ?? null,
    amenities_updated_at: now,
  }).eq('id', id);
}
