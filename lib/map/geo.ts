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
 * - zoom 7~9 (시군구): TOP 30
 * - zoom 10~11 (시군구 확대): TOP 60
 * - zoom 12+ (동네): TOP 100
 *
 * 데이터가 희소(시도별 TOP20 ≈ 477개)하여 전국 영역에서도 최저가 100개를
 * 모두 보여주는 것이 사용자 가치가 크므로, 줌아웃 시에도 TOP 100을 반환한다.
 */
export function topNByZoom(zoom: number): number {
  if (zoom <= 6) return 100;         // 전국/광역: 최저가 TOP 100
  if (zoom <= 9) return 30;          // 시/군/구
  if (zoom <= 11) return 60;
  return 100;                        // 동네 상세
}

/** 가격 색상 분류 */
export function priceTier(price: number, avg: number): 'cheap' | 'normal' | 'expensive' {
  const diff = price - avg;
  if (diff <= -30) return 'cheap';
  if (diff >= 30) return 'expensive';
  return 'normal';
}

/**
 * 표시 집합 기준 최저가 TOP N의 순위 맵을 반환한다 (FR-1.2/1.4 강조용).
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
