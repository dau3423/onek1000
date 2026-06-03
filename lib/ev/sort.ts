// 전기차 충전소 정렬 — 충전소엔 단가 데이터가 없으므로(공단 API 미제공) 주유소의 "최저가" 대신
// EV 사용자가 실제로 원하는 기준으로 정렬한다:
//   (1) 사용가능 충전기 있음(availableChargers > 0) 우선
//   (2) 급속 보유(hasFast) 우선
//   (3) 기준 좌표(내 위치 또는 화면 중심)에서 가까운 순
// 기준 좌표가 없으면 (1)(2)만으로 정렬하고, 동률은 사용가능 대수·총 대수로 푼다.

import type { EvStationMarker } from '@/types/ev';
import { distanceMeters } from '@/lib/map/geo';

/** 정렬용 충전소 + 계산된 거리(m). origin이 없으면 distance=null. */
export interface EvStationRanked extends EvStationMarker {
  /** origin(내 위치/화면 중심) 기준 거리(m). origin 없으면 null. */
  distance: number | null;
}

export interface EvSortOrigin {
  lat: number;
  lng: number;
}

/**
 * 충전소 목록을 EV 사용자 기준으로 정렬해 반환한다(원본 불변).
 * - origin이 있으면 각 항목에 distance(m)를 계산해 채우고 거리순을 3순위로 적용.
 * - origin이 없으면 distance=null, 거리 비교는 생략(사용가능·급속·대수 기준만).
 *
 * 정렬 우선순위(내림 = 우선):
 *  1) 사용가능 충전기 있음(available > 0)
 *  2) 급속 보유(hasFast)
 *  3) 거리 가까운 순(origin 있을 때)
 *  4) 동률 tie-break: 사용가능 대수 ↓ → 총 대수 ↓ → 이름(안정성)
 */
export function rankEvStations(
  stations: EvStationMarker[],
  origin: EvSortOrigin | null,
): EvStationRanked[] {
  const ranked: EvStationRanked[] = stations.map((s) => ({
    ...s,
    distance: origin ? distanceMeters(origin.lat, origin.lng, s.lat, s.lng) : null,
  }));

  ranked.sort((a, b) => {
    // (1) 사용가능 우선
    const aAvail = a.availableChargers > 0 ? 1 : 0;
    const bAvail = b.availableChargers > 0 ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;

    // (2) 급속 보유 우선
    const aFast = a.hasFast ? 1 : 0;
    const bFast = b.hasFast ? 1 : 0;
    if (aFast !== bFast) return bFast - aFast;

    // (3) 거리 가까운 순 (origin 있을 때만)
    if (a.distance != null && b.distance != null && a.distance !== b.distance) {
      return a.distance - b.distance;
    }

    // (4) tie-break: 사용가능 대수 → 총 대수 → 이름
    if (a.availableChargers !== b.availableChargers) return b.availableChargers - a.availableChargers;
    if (a.totalChargers !== b.totalChargers) return b.totalChargers - a.totalChargers;
    return a.name.localeCompare(b.name, 'ko');
  });

  return ranked;
}
