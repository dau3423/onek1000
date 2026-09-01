// 전기차 충전소 bbox(지도 영역) 조회 — 우리 DB(ev_chargers)만 조회. data.go.kr는 sync에서만 호출.
// 주유소 /api/stations/bbox 와 동일 패턴(입력 검증 + Redis 캐시 + RPC/mock 폴백).

import { NextResponse } from 'next/server';
import { queryEvChargersByBbox } from '@/lib/db/ev';
import { redis, keys, bboxCacheKey } from '@/lib/cache/redis';
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

  // 중심만으로 키를 만들면 화면 크기(=사실상 줌)가 다른 요청이 서로의 캐시를 받는다.
  // bboxCacheKey가 영역 크기를 함께 담아 그 혼선을 막는다.
  const cacheKey = keys.evBbox(bboxCacheKey({ swLat, swLng, neLat, neLng }, 2));

  const cached = await redis.getJson<EvBboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  // 조회 실패(statement timeout 등)를 500으로 흘리지 않는다. lib/db/ev.ts는 RPC 오류를 throw하는데,
  // 그대로 두면 라우트가 **빈 본문 500**을 내고 클라이언트(page.tsx의 ev fetch)는 이를 console.error로
  // 삼켜, 사용자에겐 "이 지역에 충전소가 없는" 것과 구분되지 않았다. 빈 목록 + degraded 표식으로
  // 바꿔 최소한 조용히 사라지지는 않게 한다. (근본 원인은 마이그레이션 0055의 사전집계로 해소)
  let stations;
  try {
    stations = await queryEvChargersByBbox({ swLat, swLng, neLat, neLng }, EV_LIMIT);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[ev/bbox] 조회 실패 — ${msg}`);
    return NextResponse.json(
      {
        stations: [],
        bbox: { sw: [swLat, swLng], ne: [neLat, neLng] },
        cachedAt: new Date().toISOString(),
        ttlSec: 0,
        degraded: true,        // 클라이언트가 "없음"과 "못 불러옴"을 구분할 수 있게 한다.
      },
      // 실패 응답은 캐시하지 않는다 — 다음 요청이 다시 시도해야 한다.
      { status: 200, headers: { 'X-Cache': 'BYPASS', 'Cache-Control': 'no-store' } },
    );
  }

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
