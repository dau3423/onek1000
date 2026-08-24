// 렌터카 도메인 쿼리 — Supabase 미설정 시 빈 배열 폴백 (lib/db/repair.ts 와 동일 패턴).
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Bbox } from '@/lib/map/geo';
import type { RentalDetail, RentalFilter, RentalFees, RentalMarker } from '@/types/rental';

interface BboxRpcRow {
  place_key: string;
  name: string;
  biz_kind: string | null;
  road_addr: string | null;
  jibun_addr: string | null;
  tel: string | null;
  homepage: string | null;
  wd_open: string | null; wd_close: string | null;
  we_open: string | null; we_close: string | null;
  hd_open: string | null; hd_close: string | null;
  holiday: string | null;
  total_cars: number | null;
  sedan_cars: number | null;
  van_cars: number | null;
  ev_sedan_cars: number | null;
  ev_van_cars: number | null;
  fee_light: number | null;
  fee_small: number | null;
  fee_medium: number | null;
  fee_large: number | null;
  fee_van: number | null;
  fee_leisure: number | null;
  fee_imported: number | null;
  lat: number;
  lng: number;
  data_base_date: string | null;
  synced_at: string | null;
}

/** 0 이하/누락 요금은 담지 않는다 — '0원'이 화면에 나가면 무료로 오해된다. */
function toFees(r: BboxRpcRow): RentalFees {
  const fees: RentalFees = {};
  const put = (k: keyof RentalFees, v: number | null) => {
    if (typeof v === 'number' && v > 0) fees[k] = v;
  };
  put('light', r.fee_light);
  put('small', r.fee_small);
  put('medium', r.fee_medium);
  put('large', r.fee_large);
  put('van', r.fee_van);
  put('leisure', r.fee_leisure);
  put('imported', r.fee_imported);
  return fees;
}

function rowToMarker(r: BboxRpcRow): RentalMarker {
  return {
    placeKey: r.place_key,
    name: r.name,
    bizKind: r.biz_kind,
    roadAddr: r.road_addr,
    jibunAddr: r.jibun_addr,
    tel: r.tel,
    homepage: r.homepage,
    totalCars: r.total_cars,
    evCars: (r.ev_sedan_cars ?? 0) + (r.ev_van_cars ?? 0),
    fees: toFees(r),
    lat: r.lat,
    lng: r.lng,
    dataBaseDate: r.data_base_date,
    syncedAt: r.synced_at,
  };
}

/**
 * bbox(지도 영역) 내 렌터카 마커.
 * 마이그레이션 미적용/데이터 0건이면 빈 배열(500 없이) — 0050 적용 전에 배포돼도 안전하다.
 *
 * 전기차 필터는 반드시 서버에서 건다. limit 이 필터보다 먼저 걸리면 전기차 보유 업체가
 * 통째로 잘려 "필터를 켰는데 아무것도 없는" 화면이 된다(정비소 브랜드 필터에서 겪은 문제).
 */
export async function queryRentalByBbox(
  bbox: Bbox,
  limit: number,
  filter: RentalFilter = 'all',
): Promise<RentalMarker[]> {
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_rental_by_bbox', {
    p_sw_lng: bbox.swLng, p_sw_lat: bbox.swLat,
    p_ne_lng: bbox.neLng, p_ne_lat: bbox.neLat,
    p_limit: limit,
    p_ev_only: filter === 'ev',
  });
  if (error) {
    console.warn('rental bbox query fail (fallback empty):', error.message);
    return [];
  }
  return ((data as BboxRpcRow[]) ?? []).map(rowToMarker);
}

/** 렌터카 단건 상세. 없으면 null(상세 페이지가 404 처리). */
export async function queryRentalDetail(placeKey: string): Promise<RentalDetail | null> {
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('rental_cars')
    .select(
      'place_key,name,biz_kind,road_addr,jibun_addr,tel,homepage,wd_open,wd_close,we_open,we_close,' +
      'hd_open,hd_close,holiday,total_cars,sedan_cars,van_cars,ev_sedan_cars,ev_van_cars,' +
      'fee_light,fee_small,fee_medium,fee_large,fee_van,fee_leisure,fee_imported,' +
      'lat,lng,data_base_date,synced_at',
    )
    .eq('place_key', placeKey)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('rental detail query fail:', error.message);
    return null;
  }
  // select 목록이 길어 PostgREST 제네릭 추론이 풀리지 않는다 — 행 모양은 위 select 와 1:1이다.
  const r = data as unknown as BboxRpcRow;
  return {
    ...rowToMarker(r),
    weekdayOpen: r.wd_open,
    weekdayClose: r.wd_close,
    weekendOpen: r.we_open,
    weekendClose: r.we_close,
    holidayOpen: r.hd_open,
    holidayClose: r.hd_close,
    holiday: r.holiday,
    sedanCars: r.sedan_cars,
    vanCars: r.van_cars,
    evSedanCars: r.ev_sedan_cars,
    evVanCars: r.ev_van_cars,
  };
}
