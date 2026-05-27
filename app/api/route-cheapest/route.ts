// 경로별 최저가 — 출발/도착 좌표를 잇는 직선의 buffer(기본 2km) 내 최저가 TOP N
// 베타 후반에는 카카오모빌리티 길찾기 API 결과 LineString으로 교체 가능
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getMockStations } from '@/lib/mock/stations';
import { distanceMeters } from '@/lib/map/geo';
import type { ProductCode, BrandCode, SidoCode, StationWithPrice } from '@/types/station';

export const revalidate = 300;

/** 점-선분 최소거리 (m, 평면근사) */
function pointToSegmentMeters(
  lat: number, lng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  // 좌표를 평면으로 근사 (1도 위도 ≈ 111,320m, 경도는 cos(lat) 보정)
  const cosLat = Math.cos((aLat * Math.PI) / 180);
  const ax = aLng * 111320 * cosLat, ay = aLat * 110540;
  const bx = bLng * 111320 * cosLat, by = bLat * 110540;
  const px = lng * 111320 * cosLat, py = lat * 110540;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distanceMeters(lat, lng, aLat, aLng);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromLat = Number(url.searchParams.get('fromLat'));
  const fromLng = Number(url.searchParams.get('fromLng'));
  const toLat = Number(url.searchParams.get('toLat'));
  const toLng = Number(url.searchParams.get('toLng'));
  const buffer = Number(url.searchParams.get('buffer') ?? '2000');
  const product = (url.searchParams.get('product') ?? 'B027') as ProductCode;
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit') ?? '10')));

  if ([fromLat, fromLng, toLat, toLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid coords' }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    const stations: StationWithPrice[] = getMockStations(product)
      .map((s) => ({
        ...s,
        distance: pointToSegmentMeters(s.lat, s.lng, fromLat, fromLng, toLat, toLng),
      }))
      .filter((s) => (s.distance ?? Infinity) <= buffer)
      .sort((a, b) => a.price - b.price)
      .slice(0, limit);
    return NextResponse.json({ stations, buffer, product });
  }

  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_stations_along_route', {
    p_from_lat: fromLat, p_from_lng: fromLng,
    p_to_lat: toLat, p_to_lng: toLng,
    p_buffer_m: buffer, p_product: product, p_limit: limit,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stations: StationWithPrice[] = (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, brand: (r.brand_code as BrandCode) ?? 'ETC',
    isSelf: r.is_self, sido: '01' as SidoCode, address: '',
    lat: r.lat, lng: r.lng, product,
    price: r.price, tradeDate: r.trade_dt,
    distance: r.distance_m,
  }));
  return NextResponse.json({ stations, buffer, product });
}
