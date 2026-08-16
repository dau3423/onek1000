// 독립 세차장 도메인 쿼리 — Supabase 미설정 시 mock 폴백 (lib/db/ev.ts와 동일 패턴).
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Bbox } from '@/lib/map/geo';
import type { CarwashDetail, CarwashMarker, WashType } from '@/types/carwash';
import { getMockCarwashByBbox, getMockCarwashDetail } from '@/lib/mock/carwash';

interface BboxRpcRow {
  mgmt_no: string;
  name: string;
  wash_type: string | null;
  road_addr: string | null;
  jibun_addr: string | null;
  tel: string | null;
  weekday_open: string | null;
  weekday_close: string | null;
  fee_info: string | null;
  closed_day: string | null;
  lat: number;
  lng: number;
  data_base_date: string | null;
  synced_at: string | null;
}

/** 저장값이 4분류를 벗어나면 unknown으로 보정(정직 표기). */
function normalizeWashType(v: string | null): WashType {
  return v === 'self' || v === 'hand' || v === 'auto' ? v : 'unknown';
}

function rpcRowToMarker(r: BboxRpcRow): CarwashMarker {
  return {
    mgmtNo: r.mgmt_no,
    name: r.name,
    washType: normalizeWashType(r.wash_type),
    roadAddr: r.road_addr,
    jibunAddr: r.jibun_addr,
    tel: r.tel,
    weekdayOpen: r.weekday_open,
    weekdayClose: r.weekday_close,
    feeInfo: r.fee_info,
    closedDay: r.closed_day,
    lat: r.lat,
    lng: r.lng,
    dataBaseDate: r.data_base_date,
    syncedAt: r.synced_at,
  };
}

/**
 * bbox(지도 영역) 내 세차장 마커.
 * - NEXT_PUBLIC_USE_MOCK=true 또는 Supabase 미설정(mock 모드)이면 mock 반환(AC-1.1).
 * - 마이그레이션 미적용/데이터 0건이면 빈 배열 반환(AC-1.2, 500 없이).
 */
export async function queryCarwashByBbox(bbox: Bbox, limit: number): Promise<CarwashMarker[]> {
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return getMockCarwashByBbox(bbox, limit);
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_carwash_by_bbox', {
    p_sw_lng: bbox.swLng, p_sw_lat: bbox.swLat,
    p_ne_lng: bbox.neLng, p_ne_lat: bbox.neLat,
    p_limit: limit,
  });
  if (error) {
    // 미마이그레이션(테이블/RPC 없음, PGRST202 등)에도 레이어가 크래시하지 않도록 빈 배열로 폴백.
    console.warn('carwash bbox query fail (fallback empty):', error.message);
    return [];
  }
  return (data as BboxRpcRow[] ?? []).map(rpcRowToMarker);
}

interface DetailRow {
  mgmt_no: string;
  name: string;
  wash_type: string | null;
  road_addr: string | null;
  jibun_addr: string | null;
  tel: string | null;
  weekday_open: string | null;
  weekday_close: string | null;
  holiday_open: string | null;
  holiday_close: string | null;
  fee_info: string | null;
  closed_day: string | null;
  lat: number;
  lng: number;
  data_base_date: string | null;
  synced_at: string | null;
}

function detailRowToDetail(r: DetailRow): CarwashDetail {
  return {
    mgmtNo: r.mgmt_no,
    name: r.name,
    washType: normalizeWashType(r.wash_type),
    roadAddr: r.road_addr,
    jibunAddr: r.jibun_addr,
    tel: r.tel,
    weekdayOpen: r.weekday_open,
    weekdayClose: r.weekday_close,
    holidayOpen: r.holiday_open,
    holidayClose: r.holiday_close,
    feeInfo: r.fee_info,
    closedDay: r.closed_day,
    lat: r.lat,
    lng: r.lng,
    dataBaseDate: r.data_base_date,
    syncedAt: r.synced_at,
  };
}

/**
 * mgmt_no로 세차장 상세 1곳 조회 — 상세 페이지(/carwash/[id])용.
 * - mock 모드(NEXT_PUBLIC_USE_MOCK=true 또는 Supabase 미설정)면 mock 반환.
 * - 잘못된/없는 id면 null(라우트에서 notFound 처리).
 * - 조회 오류(미마이그레이션 등)에도 500 없이 null로 폴백.
 * 상세는 우리 DB(carwash_places)만 조회한다(원천 파일서버는 sync 전용).
 */
export async function queryCarwashDetail(mgmtNo: string): Promise<CarwashDetail | null> {
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return getMockCarwashDetail(mgmtNo);
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('carwash_places')
    .select(
      'mgmt_no, name, wash_type, road_addr, jibun_addr, tel, weekday_open, weekday_close, holiday_open, holiday_close, fee_info, closed_day, lat, lng, data_base_date, synced_at',
    )
    .eq('mgmt_no', mgmtNo)
    .maybeSingle();
  if (error) {
    console.warn('carwash detail query fail (fallback null):', error.message);
    return null;
  }
  if (!data) return null;
  return detailRowToDetail(data as DetailRow);
}
