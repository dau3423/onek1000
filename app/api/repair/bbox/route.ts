// 자동차 정비소 bbox(지도 영역) 조회 — 우리 DB(repair_shops)만 조회.
// 원천 오픈API(data.go.kr)는 sync-repair 에서만 호출한다.
// /api/carwash/bbox 와 동일 패턴(입력 검증 + Redis 캐시 + RPC/mock 폴백).

import { NextResponse } from 'next/server';
import { queryRepairByBbox } from '@/lib/db/repair';
import { redis, keys, geoQuantize } from '@/lib/cache/redis';
import type { RepairBboxResponse } from '@/types/repair';

export const revalidate = 600;

// 화면당 정비소 마커 상한. 전국 3.7만개로 세차장(1.6만)보다 조밀해 같은 값이면 도심에서
// 마커가 뭉개진다 — 세차장(200)보다 낮게 잡아 렌더 비용과 가독성을 지킨다.
const REPAIR_LIMIT = 150;

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
  const cacheKey = keys.repairBbox(geoQuantize(cx, cy, 2));

  const cached = await redis.getJson<RepairBboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  // 미마이그레이션/0건/mock 어떤 경우에도 500 없이 200+배열(빈 배열 포함) 반환.
  const shops = await queryRepairByBbox({ swLat, swLng, neLat, neLng }, REPAIR_LIMIT);

  const body: RepairBboxResponse = {
    shops,
    bbox: { sw: [swLat, swLng], ne: [neLat, neLng] },
    cachedAt: new Date().toISOString(),
    ttlSec: 600,
  };
  await redis.setJson(cacheKey, body, 600);

  return NextResponse.json(body, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
  });
}
