import { NextResponse } from 'next/server';
import type { StationsInBboxResponse } from '@/types/station';
import { queryStationsInBbox } from '@/lib/db/queries';
import { redis, keys, geoQuantize } from '@/lib/cache/redis';

export const revalidate = 600;

// 화면 영역(bbox) 내 "전체 주유소"(가격 유무 무관) — 지도 회색 점(비하이라이트) 렌더용.
// 클라이언트는 일정 줌 이상 확대 시에만 호출한다(줌 게이팅). 마커 상한을 위해 limit 을 둔다.
const MAX_LIMIT = 500;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const swLat = Number(url.searchParams.get('swLat'));
  const swLng = Number(url.searchParams.get('swLng'));
  const neLat = Number(url.searchParams.get('neLat'));
  const neLng = Number(url.searchParams.get('neLng'));
  const zoom = Number(url.searchParams.get('zoom') ?? '14');
  const limitParam = Number(url.searchParams.get('limit') ?? String(MAX_LIMIT));
  const limit = Math.min(Number.isFinite(limitParam) ? limitParam : MAX_LIMIT, MAX_LIMIT);

  if ([swLat, swLng, neLat, neLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }

  const cx = (swLat + neLat) / 2;
  const cy = (swLng + neLng) / 2;
  // 줌 인 상태(이 API는 확대 시에만 호출)라 격자 분해능을 높게(≈10km) 잡아 캐시 적중률을 확보.
  const cacheKey = keys.stationsInBbox(zoom, geoQuantize(cx, cy, 2));

  const cached = await redis.getJson<StationsInBboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  let stations: StationsInBboxResponse['stations'] = [];
  try {
    stations = await queryStationsInBbox({ swLat, swLng, neLat, neLng }, limit);
  } catch (e) {
    // 회색 점은 보조 표시이므로 조회 실패 시 빈 목록으로 graceful 폴백(지도 본 동작 영향 0).
    console.error('all-in-bbox query fail', e);
    stations = [];
  }

  const body: StationsInBboxResponse = {
    stations,
    bbox: { sw: [swLat, swLng], ne: [neLat, neLng] },
    cachedAt: new Date().toISOString(),
    ttlSec: 600,
  };
  if (stations.length) await redis.setJson(cacheKey, body, 600);

  return NextResponse.json(body, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
  });
}
