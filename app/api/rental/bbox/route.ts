// 렌터카 bbox(지도 영역) 조회 — 우리 DB(rental_cars)만 조회.
// 원천 오픈API(data.go.kr)는 sync-rental 에서만 호출한다.
// /api/repair/bbox 와 동일 패턴(입력 검증 + Redis 캐시 + RPC 폴백).

import { NextResponse } from 'next/server';
import { queryRentalByBbox } from '@/lib/db/rental';
import { redis, keys, geoQuantize } from '@/lib/cache/redis';
import type { RentalBboxResponse, RentalFilter } from '@/types/rental';

export const revalidate = 600;

// 화면당 마커 상한. 전국 렌터카는 수천 곳 규모로 정비소(3.4만)보다 훨씬 희소해서,
// 상한을 낮게 잡을 이유가 없다. 다만 서버가 상한을 강제해 주소창으로 전국을 통째로
// 긁는 것은 막는다(정비소와 동일 원칙).
const RENTAL_LIMIT = 200;
const RENTAL_LIMIT_MIN = 10;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const swLat = Number(url.searchParams.get('swLat'));
  const swLng = Number(url.searchParams.get('swLng'));
  const neLat = Number(url.searchParams.get('neLat'));
  const neLng = Number(url.searchParams.get('neLng'));

  if ([swLat, swLng, neLat, neLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }

  const rawFilter = url.searchParams.get('filter') ?? 'all';
  const filter: RentalFilter = rawFilter === 'ev' ? 'ev' : 'all';

  // ⚠️ Number(null) 은 0 이고 0 은 유한한 수다 — 값의 유무를 먼저 판정한 뒤에만 숫자로 본다.
  //    (정비소에서 이 실수로 limit 이 기본 150 대신 최소 10 으로 눌려 배포된 적이 있다.)
  const rawLimit = url.searchParams.get('limit');
  const parsedLimit = rawLimit != null && rawLimit.trim() !== '' ? Number(rawLimit) : NaN;
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), RENTAL_LIMIT_MIN), RENTAL_LIMIT)
    : RENTAL_LIMIT;

  const cx = (swLat + neLat) / 2;
  const cy = (swLng + neLng) / 2;
  // 필터·limit 을 캐시키에 넣지 않으면 필터 결과가 전체 결과 자리에 캐시된다(그 반대도).
  const cacheKey = keys.rentalBbox(`${geoQuantize(cx, cy, 2)}:${filter}:${limit}`);

  const cached = await redis.getJson<RentalBboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  // 미마이그레이션/0건 어떤 경우에도 500 없이 200+빈 배열 반환.
  const places = await queryRentalByBbox({ swLat, swLng, neLat, neLng }, limit, filter);

  const body: RentalBboxResponse = {
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
