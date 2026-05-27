import { NextResponse } from 'next/server';
import { queryStationDetail } from '@/lib/db/queries';
import { redis, keys } from '@/lib/cache/redis';

export const revalidate = 600;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const cacheKey = keys.detail(params.id);
  const cached = await redis.getJson(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  const detail = await queryStationDetail(params.id);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await redis.setJson(cacheKey, detail, 600);
  return NextResponse.json(detail, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
  });
}
