import { NextResponse } from 'next/server';
import type { ProductCode, BboxResponse } from '@/types/station';
import { topNByZoom } from '@/lib/map/geo';
import { queryStationsByBbox } from '@/lib/db/queries';
import { redis, keys, geoQuantize } from '@/lib/cache/redis';

export const revalidate = 600;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const swLat = Number(url.searchParams.get('swLat'));
  const swLng = Number(url.searchParams.get('swLng'));
  const neLat = Number(url.searchParams.get('neLat'));
  const neLng = Number(url.searchParams.get('neLng'));
  const zoom = Number(url.searchParams.get('zoom') ?? '12');
  const product = (url.searchParams.get('product') ?? 'B027') as ProductCode;

  if ([swLat, swLng, neLat, neLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }

  const limit = topNByZoom(zoom);
  const cx = (swLat + neLat) / 2;
  const cy = (swLng + neLng) / 2;
  const precision = zoom >= 12 ? 2 : 1;     // 줌 인일수록 캐시 분해능을 높임 (≈10km/100km)
  const cacheKey = keys.bbox(zoom, product, geoQuantize(cx, cy, precision));

  const cached = await redis.getJson<BboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  const stations = await queryStationsByBbox({ swLat, swLng, neLat, neLng }, product, limit);

  const body: BboxResponse = {
    stations,
    bbox: { sw: [swLat, swLng], ne: [neLat, neLng] },
    zoom,
    cachedAt: new Date().toISOString(),
    ttlSec: 600,
  };
  await redis.setJson(cacheKey, body, 600);

  return NextResponse.json(body, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
  });
}
