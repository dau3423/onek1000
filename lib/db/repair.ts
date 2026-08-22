// 자동차 정비소 도메인 쿼리 — Supabase 미설정 시 mock 폴백 (lib/db/carwash.ts와 동일 패턴).
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Bbox } from '@/lib/map/geo';
import type { RepairBrand, RepairDetail, RepairMarker, RepairShopType } from '@/types/repair';
import { getMockRepairByBbox, getMockRepairDetail } from '@/lib/mock/repair';

interface BboxRpcRow {
  shop_key: string;
  name: string;
  shop_type: string | null;
  brand: string | null;
  road_addr: string | null;
  jibun_addr: string | null;
  tel: string | null;
  open_time: string | null;
  close_time: string | null;
  lat: number;
  lng: number;
  data_base_date: string | null;
  synced_at: string | null;
}

const BRANDS = new Set<string>(['autoq','bluehands','speedmate','renault','autooasis','kgm','chevrolet','carpos','imported']);
/** 저장값이 알려진 브랜드가 아니면 null(무소속)로 본다 — 모르는 값을 그대로 흘리지 않는다. */
function normalizeBrand(v: string | null): RepairBrand | null {
  return v && BRANDS.has(v) ? (v as RepairBrand) : null;
}

/** 저장값이 정의된 유형을 벗어나면 unknown 으로 보정(정직 표기). */
function normalizeShopType(v: string | null): RepairShopType {
  return v === 'general' || v === 'small' || v === 'specialty' || v === 'engine' ? v : 'unknown';
}

function rpcRowToMarker(r: BboxRpcRow): RepairMarker {
  return {
    shopKey: r.shop_key,
    name: r.name,
    shopType: normalizeShopType(r.shop_type),
    brand: normalizeBrand(r.brand),
    roadAddr: r.road_addr,
    jibunAddr: r.jibun_addr,
    tel: r.tel,
    openTime: r.open_time,
    closeTime: r.close_time,
    lat: r.lat,
    lng: r.lng,
    dataBaseDate: r.data_base_date,
    syncedAt: r.synced_at,
  };
}

/**
 * bbox(지도 영역) 내 정비소 마커.
 * - NEXT_PUBLIC_USE_MOCK=true 또는 Supabase 미설정(mock 모드)이면 mock 반환.
 * - 마이그레이션 미적용/데이터 0건이면 빈 배열 반환(500 없이) — 0042 적용 전에 배포돼도 안전하다.
 */
export async function queryRepairByBbox(bbox: Bbox, limit: number): Promise<RepairMarker[]> {
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return getMockRepairByBbox(bbox, limit);
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_repair_by_bbox', {
    p_sw_lng: bbox.swLng, p_sw_lat: bbox.swLat,
    p_ne_lng: bbox.neLng, p_ne_lat: bbox.neLat,
    p_limit: limit,
  });
  if (error) {
    // 미마이그레이션(테이블/RPC 없음, PGRST202 등)에도 레이어가 크래시하지 않도록 빈 배열로 폴백.
    console.warn('repair bbox query fail (fallback empty):', error.message);
    return [];
  }
  return (data as BboxRpcRow[] ?? []).map(rpcRowToMarker);
}

interface DetailRow extends BboxRpcRow {
  institution: string | null;
  area: string | null;
}

/** 정비소 단건 상세. 없으면 null(상세 페이지가 404 처리). */
export async function queryRepairDetail(shopKey: string): Promise<RepairDetail | null> {
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return getMockRepairDetail(shopKey);
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('repair_shops')
    .select('shop_key,name,shop_type,brand,road_addr,jibun_addr,tel,open_time,close_time,lat,lng,data_base_date,synced_at,institution,area')
    .eq('shop_key', shopKey)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('repair detail query fail:', error.message);
    return null;
  }
  const r = data as DetailRow;
  return { ...rpcRowToMarker(r), institution: r.institution, area: r.area };
}
