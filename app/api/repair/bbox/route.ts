// 자동차 정비소 bbox(지도 영역) 조회 — 우리 DB(repair_shops)만 조회.
// 원천 오픈API(data.go.kr)는 sync-repair 에서만 호출한다.
// /api/carwash/bbox 와 동일 패턴(입력 검증 + Redis 캐시 + RPC/mock 폴백).

import { NextResponse } from 'next/server';
import { queryRepairByBbox } from '@/lib/db/repair';
import { redis, keys, bboxCacheKey } from '@/lib/cache/redis';
import type { RepairBboxResponse, RepairBrandFilter } from '@/types/repair';

export const revalidate = 600;

// 화면당 정비소 마커 상한(최대). 전국 3.4만개로 세차장(1.6만)보다 조밀해 같은 값이면 도심에서
// 마커가 뭉개진다 — 세차장(200)보다 낮게 잡아 렌더 비용과 가독성을 지킨다.
//
// 클라이언트가 줌 레벨에 따라 더 작은 limit 을 보낼 수 있다(전국 40 / 시도 80 / 시군구 150).
// 축소할수록 적게 받아, RPC 의 '브랜드 우선' 정렬에 따라 알아볼 수 있는 곳만 남는다.
// 서버가 상한을 강제한다 — 주소창으로 limit=99999 를 넣어 전국을 통째로 긁는 걸 막는다.
const REPAIR_LIMIT = 150;
const REPAIR_LIMIT_MIN = 10;

/** 허용 brand 값 — types/repair.ts 의 RepairBrandFilter 와 1:1. */
const BRAND_VALUES = [
  'all', 'none', 'autoq', 'bluehands', 'speedmate', 'renault',
  'autooasis', 'kgm', 'chevrolet', 'carpos', 'gongim', 'tire', 'inspection', 'imported',
] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const swLat = Number(url.searchParams.get('swLat'));
  const swLng = Number(url.searchParams.get('swLng'));
  const neLat = Number(url.searchParams.get('neLat'));
  const neLng = Number(url.searchParams.get('neLng'));

  if ([swLat, swLng, neLat, neLng].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }

  // 브랜드 필터 — 화이트리스트 검증(주소창으로 아무 값이나 들어올 수 있다).
  const rawBrand = url.searchParams.get('brand') ?? 'all';
  const brand: RepairBrandFilter = (BRAND_VALUES as readonly string[]).includes(rawBrand)
    ? (rawBrand as RepairBrandFilter)
    : 'all';

  // 줌 레벨별 상한 — 값이 없거나 숫자가 아니면 기본(최대)으로 되돌린다.
  //
  // ⚠️ Number(null) 은 0 이고 0 은 유한한 수다. get() 결과를 그대로 Number() 에 넣으면
  //    "파라미터 없음"이 0 으로 읽혀 최소값(10)까지 눌린다 — 실제로 그렇게 배포돼
  //    limit 없이 부른 응답이 150 건이 아니라 10 건만 왔다. 빈 문자열도 같다.
  //    그래서 값의 유무를 먼저 판정하고, 그다음에만 숫자로 본다.
  const rawLimit = url.searchParams.get('limit');
  const parsedLimit = rawLimit != null && rawLimit.trim() !== '' ? Number(rawLimit) : NaN;
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), REPAIR_LIMIT_MIN), REPAIR_LIMIT)
    : REPAIR_LIMIT;

  // 캐시키에 브랜드를 넣지 않으면 필터 결과가 전체 결과 자리에 캐시된다(그 반대도).
  // limit 도 캐시키에 넣는다 — 40개짜리 응답이 150개 자리에 캐시되면 확대해도 안 늘어난다.
  const cacheKey = keys.repairBbox(`${bboxCacheKey({ swLat, swLng, neLat, neLng }, 2)}:${brand}:${limit}`);

  const cached = await redis.getJson<RepairBboxResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  }

  // 미마이그레이션/0건/mock 어떤 경우에도 500 없이 200+배열(빈 배열 포함) 반환.
  const shops = await queryRepairByBbox({ swLat, swLng, neLat, neLng }, limit, brand);

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
