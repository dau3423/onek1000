// 장소 종류별 "존재하는가 + 좌표는 무엇인가" 단일 출처.
// reviews 에서 외래키를 뺐으므로(대상 테이블이 셋, EV 는 충전소 단위 행이 없음) 존재 검증을
// 애플리케이션이 대신한다. 지오펜스 좌표 조회도 종류마다 테이블/컬럼이 달라 여기서 흡수한다.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlaceType } from '@/types/review';

export interface PlaceTarget {
  exists: boolean;
  lat: number | null;
  lng: number | null;
}

/**
 * 대상 장소의 존재 여부와 좌표를 조회한다.
 * ev 는 충전소 단위 행이 없어 stat_id 로 아무 충전기 1행을 집는다(좌표는 충전소 공통).
 * 좌표가 없으면 lat/lng 가 null 이며, 호출부는 지오펜스를 건너뛴다(정상 사용자를 막지 않기 위해).
 */
export async function resolvePlaceTarget(
  sb: SupabaseClient,
  type: PlaceType,
  id: string,
): Promise<PlaceTarget> {
  const miss: PlaceTarget = { exists: false, lat: null, lng: null };
  if (!id) return miss;

  if (type === 'gas') {
    const { data } = await sb.from('stations').select('lat, lng').eq('id', id).maybeSingle();
    if (!data) return miss;
    return { exists: true, lat: num(data.lat), lng: num(data.lng) };
  }
  if (type === 'ev') {
    const { data } = await sb
      .from('ev_chargers')
      .select('lat, lng')
      .eq('stat_id', id)
      .limit(1)
      .maybeSingle();
    if (!data) return miss;
    return { exists: true, lat: num(data.lat), lng: num(data.lng) };
  }
  if (type === 'carwash') {
    const { data } = await sb
      .from('carwash_places')
      .select('lat, lng')
      .eq('mgmt_no', id)
      .maybeSingle();
    if (!data) return miss;
    return { exists: true, lat: num(data.lat), lng: num(data.lng) };
  }
  // repair — 0042 미적용 환경에서는 조회가 에러이고 data 가 없으므로 자연히 miss 가 된다
  // (리뷰 작성이 막힐 뿐, 다른 장소 리뷰나 지도는 영향받지 않는다).
  const { data } = await sb
    .from('repair_shops')
    .select('lat, lng')
    .eq('shop_key', id)
    .maybeSingle();
  if (!data) return miss;
  return { exists: true, lat: num(data.lat), lng: num(data.lng) };
}

function num(v: unknown): number | null {
  // null/undefined 는 "좌표 없음" 이지 0 이 아니다. Number(null) === 0 이라 이 가드가 없으면
  // 좌표 없는 장소가 (0,0) 취급돼 지오펜스가 사용자를 실제 지구 반대편만큼 떨어진 것으로 판정한다.
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
