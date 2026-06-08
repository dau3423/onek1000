// ④ 지역 가격 추세/타이밍 — 어떤 지점 반경의 최근 7일 vs 직전 7일 평균가 비교.
// 외부 API 호출 없이 우리 DB(prices_history)만 사용. 공개(전체 사용자, 비로그인 포함).
// 데이터 부족 시 trend=null 로 응답해 클라이언트가 배너를 띄우지 않게 한다.
import { NextResponse } from 'next/server';
import type { ProductCode } from '@/types/station';
import { queryPriceTrend } from '@/lib/db/queries';
import { redis, keys, geoQuantize } from '@/lib/cache/redis';

export const revalidate = 3600;

// 기본 반경 — "내 지역" 체감 범위(5km). 1~20km 범위로 클램프.
const DEFAULT_RADIUS_M = 5000;
const MIN_RADIUS_M = 1000;
const MAX_RADIUS_M = 20000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const product = (url.searchParams.get('product') ?? 'B027') as ProductCode;
  const rRaw = Number(url.searchParams.get('r') ?? String(DEFAULT_RADIUS_M));
  const r = Number.isFinite(rRaw)
    ? Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, rRaw))
    : DEFAULT_RADIUS_M;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'invalid coords' }, { status: 400 });
  }

  const cacheKey = keys.priceTrend(product, geoQuantize(lat, lng, 2), r);
  const cached = await redis.getJson(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  }

  try {
    const trend = await queryPriceTrend(lat, lng, r, product);
    await redis.setJson(cacheKey, trend, 3600);
    return NextResponse.json(trend, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (e) {
    // 추세는 부가 정보다 — 실패해도 본 지도 동작에 영향 0(클라이언트는 배너만 생략).
    console.error('price-trend failed', e);
    return NextResponse.json(
      { trend: null, changePct: null, recentAvg: null, priorAvg: null, recentN: 0, priorN: 0, basis: '' },
      { status: 200 },
    );
  }
}
