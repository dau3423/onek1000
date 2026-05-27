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

/** 줌 레벨별 표시 개수 정책 */
export function topNByZoom(zoom: number): number {
  if (zoom <= 6) return 17;          // 시도 평균
  if (zoom <= 9) return 30;
  if (zoom <= 11) return 60;
  return 100;
}

/** 가격 색상 분류 */
export function priceTier(price: number, avg: number): 'cheap' | 'normal' | 'expensive' {
  const diff = price - avg;
  if (diff <= -30) return 'cheap';
  if (diff >= 30) return 'expensive';
  return 'normal';
}
