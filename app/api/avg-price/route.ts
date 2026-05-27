import { NextResponse } from 'next/server';
import { fetchAvgBySido } from '@/lib/opinet/client';
import type { ProductCode, AvgPriceResponse } from '@/types/station';
import { SIDO_NAME } from '@/types/station';

export const revalidate = 3600;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const product = (url.searchParams.get('product') ?? 'B027') as ProductCode;
  const sido = await fetchAvgBySido(product);
  const nation = sido.length
    ? Math.round(sido.reduce((s, x) => s + x.price, 0) / sido.length)
    : 0;

  const body: AvgPriceResponse = {
    product,
    nation,
    sido: sido.map((s) => ({ code: s.code, name: SIDO_NAME[s.code] ?? s.code, price: s.price })),
    asOf: new Date().toISOString(),
  };
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
  });
}
