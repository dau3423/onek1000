// 경로별 최저가 — 카카오내비 도로 경로 주변(buffer, 기본 2km) 최저가 TOP N.
// directions(도로 경로) 성공 시 도로 path 주변 최저가, 실패 시 출발↔도착 직선 폴백.
// 응답에 path(도로 점들)를 포함해 클라이언트가 지도에 도로 Polyline을 그릴 수 있게 한다.
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getMockStations } from '@/lib/mock/stations';
import { distanceMeters } from '@/lib/map/geo';
import { fetchRoadRoute } from '@/lib/route/directions';
import type { ProductCode, BrandCode, SidoCode, StationWithPrice, RoutePoint } from '@/types/station';

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

/** 점에서 경로(폴리라인) 전체까지의 최소거리(m) — 각 구간에 대한 최소값. */
function pointToPathMeters(lat: number, lng: number, path: RoutePoint[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return distanceMeters(lat, lng, path[0].lat, path[0].lng);
  let min = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const d = pointToSegmentMeters(lat, lng, path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
    if (d < min) min = d;
  }
  return min;
}

/**
 * 도로 경로 점들을 최대 N개로 균등 다운샘플링한다.
 * directions 경로는 수백~수천 점이 될 수 있어 RPC 파라미터/거리계산 부담을 줄인다.
 * 시작·끝 점은 항상 유지한다.
 */
function downsamplePath(path: RoutePoint[], maxPoints: number): RoutePoint[] {
  if (path.length <= maxPoints) return path;
  const step = (path.length - 1) / (maxPoints - 1);
  const out: RoutePoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(path[Math.round(i * step)]);
  }
  // 마지막 점 보장
  if (out[out.length - 1] !== path[path.length - 1]) out[out.length - 1] = path[path.length - 1];
  return out;
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

  // 직선 폴백용 path(출발/도착 2점)
  const straightPath: RoutePoint[] = [
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng },
  ];

  // 1) 도로 경로 조회(검색당 1회). 키 없거나 실패 시 null → 직선 폴백.
  const road = await fetchRoadRoute({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
  // RPC 파라미터/거리계산 부담을 줄이려 도로 경로를 최대 120점으로 다운샘플링.
  const path: RoutePoint[] = road ? downsamplePath(road.path, 120) : straightPath;
  const usedRoad = Boolean(road);

  // 2-a) Supabase 미설정(mock 모드) — 도로 path(또는 직선) 주변 최저가를 순수 함수로 계산.
  if (!isSupabaseConfigured()) {
    const stations: StationWithPrice[] = getMockStations(product)
      .map((s) => ({ ...s, distance: pointToPathMeters(s.lat, s.lng, path) }))
      .filter((s) => (s.distance ?? Infinity) <= buffer)
      .sort((a, b) => a.price - b.price)
      .slice(0, limit);
    return NextResponse.json({ stations, buffer, product, path, usedRoad });
  }

  const sb = getSupabase();

  // 2-b) 도로 경로 성공 → path 주변 buffer RPC(rpc_stations_along_path).
  if (usedRoad) {
    const { data, error } = await sb.rpc('rpc_stations_along_path', {
      p_path_lng: path.map((p) => p.lng),
      p_path_lat: path.map((p) => p.lat),
      p_buffer_m: buffer, p_product: product, p_limit: limit,
    });
    if (!error) {
      const stations = mapRows(data, product);
      return NextResponse.json({ stations, buffer, product, path, usedRoad: true });
    }
    // RPC 미배포(마이그레이션 0015 미적용) 등 → 직선 RPC로 폴백
  }

  // 2-c) 직선 폴백 — 기존 rpc_stations_along_route(출발↔도착 직선).
  const { data, error } = await sb.rpc('rpc_stations_along_route', {
    p_from_lat: fromLat, p_from_lng: fromLng,
    p_to_lat: toLat, p_to_lng: toLng,
    p_buffer_m: buffer, p_product: product, p_limit: limit,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stations = mapRows(data, product);
  // 도로 RPC 실패로 직선 폴백한 경우, path도 직선으로 맞춰 클라가 직선을 그리게 한다.
  return NextResponse.json({ stations, buffer, product, path: usedRoad ? straightPath : path, usedRoad: false });
}

/** RPC 결과 행 → StationWithPrice 매핑(직선/도로 RPC 공통). */
function mapRows(data: unknown, product: ProductCode): StationWithPrice[] {
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    brand: ((r.brand_code as BrandCode) ?? 'ETC'),
    isSelf: r.is_self as boolean,
    sido: '01' as SidoCode,
    address: '',
    lat: r.lat as number,
    lng: r.lng as number,
    product,
    price: r.price as number,
    tradeDate: r.trade_dt as string,
    distance: r.distance_m as number,
  }));
}
