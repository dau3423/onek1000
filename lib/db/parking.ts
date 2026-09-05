// 주차장 조회 — 우리 DB(parking_lots)만 본다. data.go.kr 원천은 sync-parking 에서만 호출한다.
// 세차장(lib/db/carwash.ts)·렌터카와 동일 패턴.

import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import type { ParkingMarker } from '@/types/parking';
import type { Bbox } from '@/lib/map/geo';

/** RPC 행(스네이크) → 마커(카멜). bbox/반경 RPC 가 같은 컬럼 집합을 돌려주므로 공용이다. */
function rowToMarker(r: Record<string, unknown>): ParkingMarker {
  return {
    placeKey: r.place_key as string,
    name: r.name as string,
    lotKind: (r.lot_kind as string) ?? null,
    lotType: (r.lot_type as string) ?? null,
    roadAddr: (r.road_addr as string) ?? null,
    jibunAddr: (r.jibun_addr as string) ?? null,
    tel: (r.tel as string) ?? null,
    capacity: (r.capacity as number) ?? null,
    feeKind: (r.fee_kind as string) ?? null,
    basicTime: (r.basic_time as number) ?? null,
    basicCharge: (r.basic_charge as number) ?? null,
    addUnitTime: (r.add_unit_time as number) ?? null,
    addUnitCharge: (r.add_unit_charge as number) ?? null,
    dayTicket: (r.day_ticket as number) ?? null,
    monthTicket: (r.month_ticket as number) ?? null,
    payMethods: (r.pay_methods as string) ?? null,
    operDays: (r.oper_days as string) ?? null,
    wdOpen: (r.wd_open as string) ?? null,
    wdClose: (r.wd_close as string) ?? null,
    satOpen: (r.sat_open as string) ?? null,
    satClose: (r.sat_close as string) ?? null,
    hdOpen: (r.hd_open as string) ?? null,
    hdClose: (r.hd_close as string) ?? null,
    disabledZone: (r.disabled_zone as boolean) ?? null,
    note: (r.note as string) ?? null,
    instName: (r.inst_name as string) ?? null,
    lat: r.lat as number,
    lng: r.lng as number,
    ...(typeof r.distance_m === 'number' ? { distance: r.distance_m } : {}),
    dataBaseDate: (r.data_base_date as string) ?? null,
  };
}

/** 지도 영역 내 주차장. 정렬은 구획수 큰 순(RPC 측). */
export async function queryParkingByBbox(
  bbox: Bbox, limit: number, freeOnly = false,
): Promise<ParkingMarker[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase().rpc('rpc_parking_by_bbox', {
    p_sw_lng: bbox.swLng, p_sw_lat: bbox.swLat,
    p_ne_lng: bbox.neLng, p_ne_lat: bbox.neLat,
    p_limit: limit, p_free_only: freeOnly,
  });
  if (error) throw new Error(`parking bbox query failed: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(rowToMarker);
}

/**
 * 반경 내 주차장 — **직선거리순**(2단계).
 * 3단계에서 도착 시간순으로 바꾸더라도 이 함수는 그대로 쓴다: 카카오 다중 목적지 API 가
 * 한 번에 30곳까지라, 여기서 추린 상위 N 을 넘기는 구조가 된다.
 */
export async function queryParkingByRadius(
  lat: number, lng: number, radiusM: number, limit: number, freeOnly = false,
): Promise<ParkingMarker[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase().rpc('rpc_parking_by_radius', {
    p_lat: lat, p_lng: lng, p_radius_m: radiusM, p_limit: limit, p_free_only: freeOnly,
  });
  if (error) throw new Error(`parking radius query failed: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(rowToMarker);
}

/** 상세 페이지용 단건 조회. bbox/반경과 같은 rowToMarker 를 재사용한다. */
export async function queryParkingDetail(placeKey: string): Promise<ParkingMarker | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase()
    .from('parking_lots')
    .select('*')
    .eq('place_key', placeKey)
    .maybeSingle();
  if (error) throw new Error(`parking detail query failed: ${error.message}`);
  return data ? rowToMarker(data as Record<string, unknown>) : null;
}
