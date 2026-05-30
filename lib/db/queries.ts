// Supabase 기반 도메인 쿼리 — Supabase 미설정 시 mock 폴백
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { StationWithPrice, ProductCode, SidoCode, BrandCode } from '@/types/station';
import type { Bbox } from '@/lib/map/geo';
import { getMockStations, getMockStationDetail } from '@/lib/mock/stations';
import { distanceMeters, inBbox } from '@/lib/map/geo';

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

export async function queryStationDetail(id: string) {
  if (!isSupabaseConfigured()) return getMockStationDetail(id);
  const sb = getSupabase();
  const { data: s, error: e1 } = await sb
    .from('stations')
    .select('id, name, brand_code, is_self, sido_code, address, tel, has_carwash, has_cvs, has_maintenance, lat, lng')
    .eq('id', id)
    .single();
  if (e1 || !s) return null;
  const { data: prices } = await sb
    .from('prices_latest')
    .select('product, price, trade_dt')
    .eq('station_id', id);
  const priceMap: Record<string, { price: number; tradeDate: string } | null> = {
    B027: null, B034: null, D047: null, K015: null, C004: null,
  };
  for (const p of prices ?? []) {
    priceMap[p.product] = { price: p.price, tradeDate: p.trade_dt };
  }
  return {
    id: s.id, name: s.name, brand: (s.brand_code as BrandCode) ?? 'ETC',
    isSelf: s.is_self, sido: (s.sido_code as SidoCode) ?? '01',
    address: s.address ?? '', tel: s.tel ?? undefined,
    hasCarwash: !!s.has_carwash, hasCvs: !!s.has_cvs, hasMaintenance: !!s.has_maintenance,
    lat: s.lat ?? 0, lng: s.lng ?? 0,
    prices: priceMap as any,
  };
}
