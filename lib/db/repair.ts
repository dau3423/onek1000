// 자동차 정비소 도메인 쿼리 — Supabase 미설정 시 mock 폴백 (lib/db/carwash.ts와 동일 패턴).
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Bbox } from '@/lib/map/geo';
import type { RepairBrand, RepairBrandFilter, RepairDetail, RepairMarker, RepairShopType } from '@/types/repair';
import { getMockRepairByBbox, getMockRepairDetail } from '@/lib/mock/repair';
import { getApprovedRepairBrand } from './corrections';

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

const BRANDS = new Set<string>(['autoq','bluehands','speedmate','renault','autooasis','kgm','chevrolet','carpos','gongim','tire','inspection','imported']);
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
export async function queryRepairByBbox(
  bbox: Bbox,
  limit: number,
  brand: RepairBrandFilter = 'all',
): Promise<RepairMarker[]> {
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return getMockRepairByBbox(bbox, limit, brand);
  }
  const sb = getSupabase();
  // 브랜드 필터는 반드시 서버에서 건다 — limit(150) 이 필터보다 먼저 걸리면
  // 소수 브랜드(블루핸즈 전국 74곳)가 통째로 잘려 "필터를 켰는데 아무것도 없는" 화면이 된다.
  const { data, error } = await sb.rpc('rpc_repair_by_bbox', {
    p_sw_lng: bbox.swLng, p_sw_lat: bbox.swLat,
    p_ne_lng: bbox.neLng, p_ne_lat: bbox.neLat,
    p_limit: limit,
    p_brand: brand === 'all' ? null : brand,
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

/**
 * 검사소 단건 → 정비소 상세 모양으로 변환.
 *
 * 지도에서 검사소는 정비소 레이어에 합쳐 보이고 마커 클릭도 /repair/[key] 로 간다(0050 RPC).
 * 그런데 검사소는 별도 테이블이라, 상세 조회가 repair_shops 만 보면 **누르면 404** 가 난다.
 * 그래서 정비소에서 못 찾으면 여기로 폴백한다.
 */
async function queryInspectionAsRepair(placeKey: string): Promise<RepairDetail | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('inspection_stations')
    .select('place_key,name,office_type,road_addr,jibun_addr,tel,open_time,close_time,lat,lng,data_base_date,synced_at,lane_count')
    .eq('place_key', placeKey)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as {
    place_key: string; name: string; office_type: string | null;
    road_addr: string | null; jibun_addr: string | null; tel: string | null;
    open_time: string | null; close_time: string | null;
    lat: number; lng: number; data_base_date: string | null; synced_at: string | null;
    lane_count: number | null;
  };
  return {
    shopKey: r.place_key,
    name: r.name,
    shopType: 'inspection',
    brand: 'inspection',
    roadAddr: r.road_addr,
    jibunAddr: r.jibun_addr,
    tel: r.tel,
    openTime: r.open_time,
    closeTime: r.close_time,
    lat: r.lat,
    lng: r.lng,
    dataBaseDate: r.data_base_date,
    syncedAt: r.synced_at,
    // 검사소에는 관리기관·면적 대신 검사진로수가 규모 지표다. 상세의 '면적' 칸을 재활용하지 않고
    // 비워 둔다 — 다른 단위를 같은 칸에 넣으면 잘못된 정보가 된다.
    institution: r.office_type,
    area: null,
  };
}

/** 정비소 단건 상세. 정비소에 없으면 검사소에서 찾는다. 둘 다 없으면 null(상세 페이지가 404 처리). */
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
    // 정비소에 없으면 검사소일 수 있다(지도에서 같은 레이어로 합쳐 보이므로 링크도 /repair 다).
    return queryInspectionAsRepair(shopKey).catch(() => null);
  }
  const r = data as DetailRow;
  const marker = rpcRowToMarker(r);

  // 승인된 사용자 제보가 있으면 그것이 이긴다.
  // repair_shops.brand 를 직접 고치지 않는 이유: sync-repair 가 반기마다 업체명에서 brand 를
  // 다시 계산해 덮어쓴다. 지도(rpc_repair_by_bbox)도 SQL 안에서 같은 뷰를 조인하므로
  // 지도와 상세가 항상 같은 브랜드를 보여준다.
  // 보정 조회가 실패해도 상세는 원본 브랜드로 정상 렌더된다(0049 미적용 환경 포함).
  const override = await getApprovedRepairBrand(shopKey).catch(() => null);
  const brand = override === null ? marker.brand : override === 'none' ? null : override;

  return { ...marker, brand, institution: r.institution, area: r.area };
}
