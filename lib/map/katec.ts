// Opinet 좌표(KATEC, TM128 Bessel) → WGS84(lng/lat) 변환
// Opinet API의 GIS_X_COOR / GIS_Y_COOR 는 위경도가 아니라 KATEC 투영 좌표(미터)다.
// 지도(WGS84)와 PostGIS geography(4326)에 넣으려면 반드시 변환해야 한다.

import proj4 from 'proj4';

const KATEC =
  '+proj=tmerc +lat_0=38 +lon_0=128 +ellps=bessel +x_0=400000 +y_0=600000 +k=0.9999 ' +
  '+towgs84=-145.907,505.034,685.756,-1.162,2.347,1.592,6.342 +units=m +no_defs';

/** KATEC(x,y) → { lng, lat } (WGS84). 유효하지 않으면 null. */
export function katecToWgs84(x: number, y: number): { lng: number; lat: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const [lng, lat] = proj4(KATEC, 'WGS84', [x, y]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  // 대한민국 경위도 대략 범위 밖이면 변환 실패로 간주
  if (lng < 124 || lng > 132 || lat < 33 || lat > 39) return null;
  return { lng, lat };
}

/**
 * WGS84(lng,lat) → { x, y } (KATEC/TM128, 미터). katecToWgs84 의 역변환.
 * Opinet aroundAll.do 는 입력 x,y 를 KATEC 로 받으므로, 셀 중심(WGS84)을
 * 호출에 넘기기 전에 이 함수로 변환한다. 유효하지 않으면 null.
 * (왕복 변환 오차는 cm 수준 — 운영상 무시 가능.)
 */
export function wgs84ToKatec(lng: number, lat: number): { x: number; y: number } | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const [x, y] = proj4('WGS84', KATEC, [lng, lat]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}
