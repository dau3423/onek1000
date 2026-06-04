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

/**
 * 점-선분 최소거리(m, 평면근사). 서버 `route-cheapest`의 동명 로직과 동일한 근사를 쓴다
 * (1도 위도 ≈ 110,540m, 경도는 cos(lat) 보정). 경로 이탈 판정용으로 클라이언트에서 사용.
 */
function pointToSegmentMeters(
  lat: number, lng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const cosLat = Math.cos((aLat * Math.PI) / 180);
  const ax = aLng * 111320 * cosLat, ay = aLat * 110540;
  const bx = bLng * 111320 * cosLat, by = bLat * 110540;
  const px = lng * 111320 * cosLat, py = lat * 110540;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distanceMeters(lat, lng, aLat, aLng);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * 점에서 경로(폴리라인) 전체까지의 최소거리(m). 경로 이탈 판정에 사용한다.
 * path가 비면 Infinity, 1점이면 그 점까지의 직선거리.
 */
export function distancePointToPath(
  lat: number, lng: number,
  path: Array<{ lat: number; lng: number }>,
): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return distanceMeters(lat, lng, path[0].lat, path[0].lng);
  let min = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const d = pointToSegmentMeters(lat, lng, path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
    if (d < min) min = d;
  }
  return min;
}

export type PriceTier = 'cheap' | 'normal' | 'expensive';

/**
 * 가격 tier 임계값(저렴/비쌈 경계 2개).
 * - cheapMax 이하 = 저렴(초록), expensiveMin 이상 = 비쌈(빨강), 그 사이 = 보통(노랑).
 * - null이면 "전부 보통"(억지 분류 방지 폴백).
 */
export interface PriceTierThresholds {
  cheapMax: number | null;
  expensiveMin: number | null;
}

/** 정렬된 배열에서 분위수(0~1) 값을 선형보간으로 구한다. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 표시 집합(화면 내 주유소)의 가격 분포로 tier 임계값을 산출한다.
 * 고정 ±30원이 아닌 "상대 분포(분위수)" 기준이라, 가격 폭이 좁아도 저렴/보통/비쌈이 갈린다.
 *
 * - 기본: 하위 33%(P33) 이하 = 저렴, 상위 33%(P67) 이상 = 비쌈.
 * - 폴백(전부 보통): 표본이 너무 적거나(MIN_SAMPLE 미만) 가격이 사실상 동일할 때
 *   (최저~최고 폭이 MIN_SPREAD원 미만). → cheapMax/expensiveMin = null.
 * - P33===P67(동가 다수)이면 경계가 겹쳐 모두 '보통'이 될 수 있으므로,
 *   최저가와 같은 값은 저렴, 최고가와 같은 값은 비쌈으로 떨어지도록 경계를 보정한다.
 */
export function priceTierThresholds(
  prices: number[],
  opts: { lowQ?: number; highQ?: number; minSample?: number; minSpread?: number } = {},
): PriceTierThresholds {
  const { lowQ = 1 / 3, highQ = 2 / 3, minSample = 5, minSpread = 8 } = opts;
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length < minSample) return { cheapMax: null, expensiveMin: null };

  const sorted = [...valid].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  // 가격 폭이 사실상 0(전부 동일가 수준)이면 억지 분류하지 않는다.
  if (max - min < minSpread) return { cheapMax: null, expensiveMin: null };

  let cheapMax = quantile(sorted, lowQ);
  let expensiveMin = quantile(sorted, highQ);
  // 분위수가 겹치면(동가 밀집) 최저/최고와 살짝 떨어뜨려 양 끝이 색을 받게 한다.
  if (cheapMax >= expensiveMin) {
    cheapMax = min;
    expensiveMin = max;
  }
  return { cheapMax, expensiveMin };
}

/**
 * 가격 tier 분류. 표시 집합 분포로 산출한 임계값(PriceTierThresholds)을 받아 색을 정한다.
 * 임계값이 폴백(null)이면 모두 '보통'.
 */
export function priceTier(price: number, t: PriceTierThresholds): PriceTier {
  if (t.cheapMax != null && price <= t.cheapMax) return 'cheap';
  if (t.expensiveMin != null && price >= t.expensiveMin) return 'expensive';
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
