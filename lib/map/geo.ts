// 좌표/거리 유틸리티

/** Haversine 거리 (m) */
export function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 두 좌표 사이 방위각(bearing)을 도(0~360°, 북=0 시계방향)로 반환.
 * GPS heading이 없을 때 진행 방향 폴백 계산에 사용한다.
 * - 두 점이 거의 같으면(이동 ~5m 미만) 방향이 불안정하므로 null 반환.
 */
export function bearingDeg(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number | null {
  if (distanceMeters(lat1, lng1, lat2, lng2) < 5) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dλ = toRad(lng2 - lng1);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** 좌표를 일정 정밀도로 양자화하여 캐시 키 생성 (precision=3 → ~110m) */
export function quantize(lat: number, lng: number, precision = 3): string {
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
}

export interface Bbox {
  swLat: number; swLng: number;
  neLat: number; neLng: number;
}

export function inBbox(lat: number, lng: number, b: Bbox): boolean {
  return lat >= b.swLat && lat <= b.neLat && lng >= b.swLng && lng <= b.neLng;
}

/**
 * 줌 레벨별 표시 개수 정책 (FR-1.2)
 * - zoom 1~6 (전국/광역 축소): 전국 최저가 TOP 100
 * - zoom 7~9 (시/도·시군구): TOP 60
 * - zoom 10+ (내 지역 확대~동네): TOP 100
 *
 * 카카오 level↔zoom 매핑은 zoom = 15 - level.
 * GPS 위치 획득 시 내 지역으로 자동 줌인(level 6, zoom 9)하므로, 그 이상 줌인된
 * 구간(zoom 9+)에서는 화면(bbox) 영역 자체가 좁아 TOP 100이어도 곧 내 지역
 * 주유소만 남는다. 데이터가 희소(시도별 ≈ 20, 전국 ≈ 340)하므로 별도 데이터/뷰
 * 적재 없이 "줌인하면 내 지역 최저가가 자연히 보이는" 정책으로 처리한다.
 * 전국 줌아웃(zoom ≤ 6)은 기존대로 전국 최저가 TOP 100을 유지한다.
 */
export function topNByZoom(zoom: number): number {
  if (zoom <= 6) return 100;         // 전국/광역: 전국 최저가 TOP 100
  if (zoom <= 8) return 60;          // 광역시/도
  return 100;                        // 내 지역 확대(시군구)~동네 상세
}

/** 가격 색상 분류 */
export function priceTier(price: number, avg: number): 'cheap' | 'normal' | 'expensive' {
  const diff = price - avg;
  if (diff <= -30) return 'cheap';
  if (diff >= 30) return 'expensive';
  return 'normal';
}

/**
 * 입력 집합 기준 최저가 TOP N의 순위 맵을 반환한다.
 * 전국 TOP10 mock 산출(`queryNationalTop10`) 등에서 재사용한다.
 * - 입력 stations를 가격 오름차순으로 정렬해 상위 n개를 추출한다.
 * - 반환: station id → 순위(1부터). TOP N 밖이면 맵에 없음.
 * - 동가일 경우 입력 순서를 유지(안정 정렬)하여 결정적으로 동작한다.
 */
export function topPriceRankMap<T extends { id: string; price: number }>(
  stations: T[],
  n = 10,
): Map<string, number> {
  const sorted = [...stations].sort((a, b) => a.price - b.price);
  const rank = new Map<string, number>();
  for (let i = 0; i < Math.min(n, sorted.length); i++) {
    rank.set(sorted[i].id, i + 1);
  }
  return rank;
}
