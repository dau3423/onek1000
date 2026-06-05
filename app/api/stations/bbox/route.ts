import { NextResponse } from 'next/server';
import type { ProductCode, BboxResponse, BrandCode } from '@/types/station';
import { topNByZoom } from '@/lib/map/geo';
import { queryStationsByBbox } from '@/lib/db/queries';
import { redis, keys, geoQuantize } from '@/lib/cache/redis';

export const revalidate = 600;

// brand 파라미터로 허용하는 브랜드 코드(화이트리스트). 임의 문자열 주입 방지.
const ALLOWED_BRANDS: ReadonlySet<string> = new Set<BrandCode>([
  'SKE', 'GSC', 'HDO', 'SOL', 'RTE', 'ETC', 'RTO', 'NHO', 'E1G', 'SOG', 'EXP',
]);

// 단일 브랜드만 조회할 때(특히 희소한 고속도로 EXP) 줌 아웃에서도 누락되지 않도록 충분한 상한.
// 전국 고속도로 주유소는 ~214개로 적어, 단일 브랜드 조회 시 이 정도면 화면 bbox 내 전부 담긴다.
const BRAND_ONLY_LIMIT = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const swLat = Number(url.searchParams.get('swLat'));
  const swLng = Number(url.searchParams.get('swLng'));
  const neLat = Number(url.searchParams.get('neLat'));
  const neLng = Number(url.searchParams.get('neLng'));
  const zoom = Number(url.searchParams.get('zoom') ?? '12');
  const product = (url.searchParams.get('product') ?? 'B027') as ProductCode;
  // 단일 브랜드만 보기(예: '고속도로만' 필터). 화이트리스트에 든 값만 허용, 그 외엔 무시.
  const brandParam = url.searchParams.get('brand');
  const brand = brandParam && ALLOWED_BRANDS.has(brandParam) ? (brandParam as BrandCode) : undefined;

  if ([swLat, swLng, neLat, neLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }

  // 일반 조회는 줌별 상한(topNByZoom). 단일 브랜드 조회는 희소하므로 별도 상한으로
  // 줌 아웃에서도 그 브랜드가 가격순 상한에 밀려 빠지지 않게 한다.
  const limit = brand ? BRAND_ONLY_LIMIT : topNByZoom(zoom);
  const cx = (swLat + neLat) / 2;
  const cy = (swLng + neLng) / 2;
  const precision = zoom >= 12 ? 2 : 1;     // 줌 인일수록 캐시 분해능을 높임 (≈10km/100km)
  // 브랜드 조회는 응답 집합이 다르므로 캐시 키를 브랜드별로 분리(일반/브랜드 응답 혼선 방지).
  const cacheKey = `${keys.bbox(zoom, product, geoQuantize(cx, cy, precision))}${brand ? `:${brand}` : ''}`;

  const cached = await redis.getJson<BboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  const stations = await queryStationsByBbox({ swLat, swLng, neLat, neLng }, product, limit, brand);

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
