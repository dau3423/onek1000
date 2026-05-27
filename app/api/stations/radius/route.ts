import { NextResponse } from 'next/server';
import type { ProductCode, RadiusResponse } from '@/types/station';
import { queryStationsByRadius } from '@/lib/db/queries';
import { redis, keys, geoQuantize } from '@/lib/cache/redis';

export const revalidate = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const r = Number(url.searchParams.get('r') ?? '1000');
  const product = (url.searchParams.get('product') ?? 'B027') as ProductCode;
  const limit = Number(url.searchParams.get('limit') ?? '20');

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'invalid coords' }, { status: 400 });
  }

  const cacheKey = keys.radius(product, geoQuantize(lat, lng, 3), r);
  const cached = await redis.getJson<RadiusResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  }

  const stations = await queryStationsByRadius(lat, lng, r, product, limit);
  const avg = stations.length
    ? Math.round(stations.reduce((s, x) => s + x.price, 0) / stations.length)
    : undefined;

  const body: RadiusResponse = {
    stations,
    center: [lat, lng],
    radius: r,
    averagePrice: avg,
    cachedAt: new Date().toISOString(),
    ttlSec: 300,
  };
  await redis.setJson(cacheKey, body, 300);

  return NextResponse.json(body, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
