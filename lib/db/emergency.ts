// 긴급 화면용 '내 주변 랜드마크' 조회.
//
// 왜 필요한가: 사고·고장 현장에서 보험사 상담원이 묻는 건 결국 "어디세요?" 다.
// 좌표를 읽어 주는 것보다 "○○휴게소 지나서 1km" 가 훨씬 잘 통한다 — 특히 고속도로에서.
// 이 앱은 이미 전국 주유소(휴게소 포함)와 정비소 좌표를 갖고 있으므로 그걸 그대로 쓴다.
//
// 성능 원칙: 긴급 화면은 느리면 쓸모가 없다. 공간 인덱스가 걸린 bbox 조회로 좁힌 뒤
// 애플리케이션에서 거리순 정렬만 한다(반경 RPC 를 새로 만들지 않는다).

import { getSupabase, isSupabaseConfigured } from './supabase';
import { distanceMeters } from '@/lib/map/geo';

/** 랜드마크 종류 — 화면에서 아이콘·표기를 가른다. */
export type LandmarkKind = 'highway' | 'gas' | 'repair';

export interface Landmark {
  kind: LandmarkKind;
  name: string;
  /** 현재 위치로부터의 직선거리(m). */
  distanceM: number;
  /** 고속도로 휴게소일 때만 — 노선명·방향(설명에 큰 도움이 된다). */
  routeName?: string | null;
  direction?: string | null;
}

/** 검색 반경(m). 너무 넓히면 "근처"가 아니게 되고, 좁히면 시골에서 아무것도 안 나온다. */
const RADIUS_M = 5000;
/** bbox 반변(도) — 위도 1도 ≈ 111km, 경도는 한국 위도(약 37°)에서 1도 ≈ 88km. */
const DLAT = RADIUS_M / 111_000;
const DLNG = RADIUS_M / 88_000;
/** 각 소스에서 뽑아올 후보 수. 거리순 정렬 전 단계라 넉넉히 받되 상한을 둔다. */
const CANDIDATES = 60;

/**
 * 현재 좌표 주변의 설명하기 쉬운 지점들.
 * 고속도로 휴게소를 최우선으로 올린다 — 거리가 조금 더 멀어도 위치 설명에는 가장 강력하다.
 *
 * 실패해도 절대 throw 하지 않는다. 긴급 화면은 랜드마크가 없어도 주소·좌표만으로 성립한다.
 */
export async function queryNearbyLandmarks(lat: number, lng: number, limit = 3): Promise<Landmark[]> {
  if (!isSupabaseConfigured()) return [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const sb = getSupabase();
  const bounds = (col: 'lat' | 'lng') => (col === 'lat' ? [lat - DLAT, lat + DLAT] : [lng - DLNG, lng + DLNG]);
  const [latMin, latMax] = bounds('lat');
  const [lngMin, lngMax] = bounds('lng');

  const out: Landmark[] = [];

  // 1) 주유소(고속도로 휴게소 포함) — stations 는 is_highway 플래그로 휴게소를 구분한다.
  try {
    const { data } = await sb
      .from('stations')
      .select('name, lat, lng, is_highway, route_name, direction')
      .gte('lat', latMin).lte('lat', latMax)
      .gte('lng', lngMin).lte('lng', lngMax)
      .limit(CANDIDATES);
    for (const s of (data as Array<Record<string, unknown>>) ?? []) {
      const sLat = Number(s.lat), sLng = Number(s.lng);
      if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) continue;
      const d = distanceMeters(lat, lng, sLat, sLng);
      if (d > RADIUS_M) continue;
      out.push({
        kind: s.is_highway ? 'highway' : 'gas',
        name: String(s.name ?? '').trim(),
        distanceM: Math.round(d),
        routeName: (s.route_name as string | null) ?? null,
        direction: (s.direction as string | null) ?? null,
      });
    }
  } catch {
    /* 조회 실패는 무시 — 랜드마크는 부가 정보다 */
  }

  // 2) 정비소 — 0042 미적용 환경에서는 조용히 건너뛴다.
  try {
    const { data } = await sb
      .from('repair_shops')
      .select('name, lat, lng')
      .gte('lat', latMin).lte('lat', latMax)
      .gte('lng', lngMin).lte('lng', lngMax)
      .limit(CANDIDATES);
    for (const r of (data as Array<Record<string, unknown>>) ?? []) {
      const rLat = Number(r.lat), rLng = Number(r.lng);
      if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) continue;
      const d = distanceMeters(lat, lng, rLat, rLng);
      if (d > RADIUS_M) continue;
      out.push({ kind: 'repair', name: String(r.name ?? '').trim(), distanceM: Math.round(d) });
    }
  } catch {
    /* 무시 */
  }

  // 정렬: 휴게소를 앞세우되 **가까울 때만**.
  //
  // 고속도로에서는 휴게소가 위치 설명에 가장 강력하다("○○휴게소 지나서 1km"). 하지만 도심에서는
  // 휴게소가 수 km 떨어져 있어 앞세우면 오히려 방해가 된다 — 실측(강남역)에서 4.4km 휴게소가
  // 218m 정비소를 밀어냈다. 그래서 이 거리 안에 있을 때만 우선권을 준다.
  const HIGHWAY_PRIORITY_M = 2000;
  return out
    .filter((l) => l.name.length > 0)
    .sort((a, b) => {
      const ap = a.kind === 'highway' && a.distanceM <= HIGHWAY_PRIORITY_M ? 0 : 1;
      const bp = b.kind === 'highway' && b.distanceM <= HIGHWAY_PRIORITY_M ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.distanceM - b.distanceM;
    })
    .slice(0, limit);
}
