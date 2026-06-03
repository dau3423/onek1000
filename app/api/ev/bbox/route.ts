// 전기차 충전소 bbox(지도 영역) 조회 — 우리 DB(ev_chargers)만 조회. data.go.kr는 sync에서만 호출.
// 주유소 /api/stations/bbox 와 동일 패턴(입력 검증 + Redis 캐시 + RPC/mock 폴백).

import { NextResponse } from 'next/server';
import { queryEvChargersByBbox } from '@/lib/db/ev';
import { redis, keys, geoQuantize } from '@/lib/cache/redis';
import type { EvBboxResponse } from '@/types/ev';

export const revalidate = 600;

// 화면당 충전소 마커 상한. 충전소 단위라 주유소보다 밀도가 높아 과도 렌더 방지.
const EV_LIMIT = 200;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const swLat = Number(url.searchParams.get('swLat'));
  const swLng = Number(url.searchParams.get('swLng'));
  const neLat = Number(url.searchParams.get('neLat'));
  const neLng = Number(url.searchParams.get('neLng'));

  if ([swLat, swLng, neLat, neLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }

  const cx = (swLat + neLat) / 2;
  const cy = (swLng + neLng) / 2;
  const cacheKey = keys.evBbox(geoQuantize(cx, cy, 2));

  const cached = await redis.getJson<EvBboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  const stations = await queryEvChargersByBbox({ swLat, swLng, neLat, neLng }, EV_LIMIT);

  const body: EvBboxResponse = {
    stations,
    bbox: { sw: [swLat, swLng], ne: [neLat, neLng] },
    cachedAt: new Date().toISOString(),
    ttlSec: 600,
  };
  await redis.setJson(cacheKey, body, 600);

  return NextResponse.json(body, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
  });
}
