// 긴급 화면 컨텍스트 — 좌표를 받아 "지금 어디인지 말할 수 있는 정보"를 돌려준다.
//
//  GET /api/emergency/context?lat=&lng=
//   → { address: { road, jibun } | null, landmarks: [{ kind, name, distanceM, ... }] }
//
// ⚠️ 주소는 카카오 역지오코딩 결과이며 **저장하지 않는다**(약관: 실시간 호출 사용만 허용).
//    lib/geocode/reverse.ts 주석 참고. 이 라우트도 캐시하지 않는다 — 좌표는 사용자마다 다르고,
//    저장/캐시는 곧 '보관'이라 같은 제약에 걸린다.
//
// 위치는 로그에도 남기지 않는다. 사고 현장 좌표는 민감정보다.

import { NextResponse } from 'next/server';
import { reverseGeocode } from '@/lib/geocode/reverse';
import { queryNearbyLandmarks } from '@/lib/db/emergency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 한반도 bbox — 명백한 오좌표를 거른다(다른 sync 들과 같은 기준). */
const KR = { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'invalid coords' }, { status: 400 });
  }
  if (lat < KR.latMin || lat > KR.latMax || lng < KR.lngMin || lng > KR.lngMax) {
    // 국내 서비스라 국외 좌표는 주소·랜드마크를 줄 수 없다. 화면은 좌표만으로 동작한다.
    return NextResponse.json({ address: null, landmarks: [] });
  }

  // 둘 다 실패해도 200 을 준다 — 긴급 화면이 에러로 막히면 안 된다.
  const [address, landmarks] = await Promise.all([
    reverseGeocode(lat, lng).catch(() => null),
    queryNearbyLandmarks(lat, lng).catch(() => []),
  ]);

  return NextResponse.json(
    { address, landmarks },
    // 사용자별 좌표라 공유 캐시에 담기면 안 된다.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
