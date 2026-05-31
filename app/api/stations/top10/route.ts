import { NextResponse } from 'next/server';
import type { ProductCode, NationalTop10Response } from '@/types/station';
import { queryNationalTop10 } from '@/lib/db/queries';
import { redis, keys } from '@/lib/cache/redis';

export const revalidate = 600;

const VALID_PRODUCTS: ProductCode[] = ['B027', 'B034', 'D047', 'K015', 'C004'];
const TTL_SEC = 600; // 데이터 신선도 최대 1시간 허용(NFR-3) — 동기화 주기 대비 충분히 짧게

// 전국 최저가 TOP10: 화면 영역과 무관한 전국 순위. product당 1건만 캐시하면 충분.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const product = (url.searchParams.get('product') ?? 'B027') as ProductCode;
  if (!VALID_PRODUCTS.includes(product)) {
    return NextResponse.json({ error: 'invalid product' }, { status: 400 });
  }

  const cacheKey = keys.nationalTop10(product);
  const cached = await redis.getJson<NationalTop10Response>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  const stations = await queryNationalTop10(product);
  const body: NationalTop10Response = {
    product,
    stations,
    cachedAt: new Date().toISOString(),
    ttlSec: TTL_SEC,
  };
  await redis.setJson(cacheKey, body, TTL_SEC);

  return NextResponse.json(body, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
  });
}
