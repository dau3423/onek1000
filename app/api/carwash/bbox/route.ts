// 독립 세차장 bbox(지도 영역) 조회 — 우리 DB(carwash_places)만 조회.
// 원천 파일서버(file.localdata.go.kr)는 sync-carwash에서만 호출한다.
// EV /api/ev/bbox 와 동일 패턴(입력 검증 + Redis 캐시 + RPC/mock 폴백).

import { NextResponse } from 'next/server';
import { queryCarwashByBbox } from '@/lib/db/carwash';
import { redis, keys, bboxCacheKey } from '@/lib/cache/redis';
import type { CarwashBboxResponse } from '@/types/carwash';

export const revalidate = 600;

// 화면당 세차장 마커 상한(EV_LIMIT 유사). 초과 시 서버 limit로 잘림(빈 상태 아님).
const CARWASH_LIMIT = 200;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const swLat = Number(url.searchParams.get('swLat'));
  const swLng = Number(url.searchParams.get('swLng'));
  const neLat = Number(url.searchParams.get('neLat'));
  const neLng = Number(url.searchParams.get('neLng'));

  if ([swLat, swLng, neLat, neLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }

  const cacheKey = keys.carwashBbox(bboxCacheKey({ swLat, swLng, neLat, neLng }, 2));

  const cached = await redis.getJson<CarwashBboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  // 미마이그레이션/0건/mock 어떤 경우에도 500 없이 200+배열(빈 배열 포함) 반환(AC-1.1/1.2).
  const places = await queryCarwashByBbox({ swLat, swLng, neLat, neLng }, CARWASH_LIMIT);

  const body: CarwashBboxResponse = {
    places,
    bbox: { sw: [swLat, swLng], ne: [neLat, neLng] },
    cachedAt: new Date().toISOString(),
    ttlSec: 600,
  };
  await redis.setJson(cacheKey, body, 600);

  return NextResponse.json(body, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
  });
}
