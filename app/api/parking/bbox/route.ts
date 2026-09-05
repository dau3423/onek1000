// 주차장 bbox(지도 영역) 조회 — 우리 DB(parking_lots)만 조회.
// 원천 data.go.kr 은 sync-parking 에서만 호출한다.
// EV /api/ev/bbox 와 동일 패턴(입력 검증 + Redis 캐시 + 실패 시 degraded).

import { NextResponse } from 'next/server';
import { queryParkingByBbox } from '@/lib/db/parking';
import { redis, keys, bboxCacheKey } from '@/lib/cache/redis';
import type { ParkingBboxResponse } from '@/types/parking';

export const revalidate = 600;

/** 화면당 주차장 마커 상한. 전국 17,552곳이라 도심 bbox 에서 쉽게 넘친다.
 *  넘칠 때는 RPC 가 **구획수 큰 순**으로 자른다 — 큰 곳일수록 자리가 있을 확률이 높다는 건
 *  사용자가 스스로 판단할 수 있는 사실이라, 임의로 자르는 것보다 낫다. */
const PARKING_LIMIT = 200;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const swLat = Number(url.searchParams.get('swLat'));
  const swLng = Number(url.searchParams.get('swLng'));
  const neLat = Number(url.searchParams.get('neLat'));
  const neLng = Number(url.searchParams.get('neLng'));
  // 무료만 보기(선택). 응답 집합이 달라지므로 캐시 차원에 포함한다.
  const freeOnly = url.searchParams.get('free') === '1';

  if ([swLat, swLng, neLat, neLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }

  const cacheKey = keys.parkingBbox(
    `${bboxCacheKey({ swLat, swLng, neLat, neLng }, 2)}${freeOnly ? ':free' : ''}`,
  );

  const cached = await redis.getJson<ParkingBboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  // 조회 실패를 빈 본문 500 으로 흘리지 않는다 — 클라이언트가 "이 지역에 없음"과 구분할 수 있게
  // degraded 표식을 붙여 200 으로 돌려준다(ev/bbox 에서 확립한 규약).
  let places;
  try {
    places = await queryParkingByBbox({ swLat, swLng, neLat, neLng }, PARKING_LIMIT, freeOnly);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[parking/bbox] 조회 실패 — ${msg}`);
    return NextResponse.json(
      {
        places: [],
        bbox: { sw: [swLat, swLng], ne: [neLat, neLng] },
        cachedAt: new Date().toISOString(),
        ttlSec: 0,
        degraded: true,
      },
      { status: 200, headers: { 'X-Cache': 'BYPASS', 'Cache-Control': 'no-store' } },
    );
  }

  const body: ParkingBboxResponse = {
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
