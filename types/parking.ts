// 주차장 레이어 타입.
// 기획: docs/improvements/2026-08-28-parking/plan.md
//
// ※ 만차/잔여면수는 없다. 전국 통합 실시간 원천이 존재하지 않아(서울시는 실시간 컬럼을 삭제하고
//   "추후 제공예정 없음") 모른다는 걸 숨기지 않고 **주차구획수(capacity)** 만 보여준다.
// ※ 도착 소요시간도 없다. 기획 3단계에서 카카오모빌리티 다중 목적지 API 로 계산하되,
//   카카오 약관상 결과를 저장할 수 없어 **응답에만 실리고 DB/타입에 남지 않는다.**

/** 주차장 구분 — 원천 prkplceSe 원문. 표시 전용이라 유니온으로 좁히지 않는다. */
export type ParkingLotKind = string;

/** 지도 마커 1개 = 주차장 1곳(place_key). rpc_parking_by_bbox 반환에 대응. */
export interface ParkingMarker {
  placeKey: string;
  name: string;
  /** 공영/민영 */
  lotKind: string | null;
  /** 노상/노외/부설 */
  lotType: string | null;
  roadAddr: string | null;
  jibunAddr: string | null;
  tel: string | null;
  /** 주차구획수. 만차를 모르는 대신 규모를 보여주는 값이라 목록 정렬 기준이기도 하다. */
  capacity: number | null;
  /** 무료/유료/혼합 (원천 parkingchrgeInfo 원문) */
  feeKind: string | null;
  basicTime: number | null;      // 분
  basicCharge: number | null;    // 원
  addUnitTime: number | null;    // 분
  addUnitCharge: number | null;  // 원
  dayTicket: number | null;
  monthTicket: number | null;
  payMethods: string | null;
  operDays: string | null;
  wdOpen: string | null; wdClose: string | null;
  satOpen: string | null; satClose: string | null;
  hdOpen: string | null; hdClose: string | null;
  disabledZone: boolean | null;
  note: string | null;
  instName: string | null;
  lat: number;
  lng: number;
  /** 반경 조회에서만 채워진다(m, 직선거리). bbox 조회에는 없다. */
  distance?: number;
  dataBaseDate: string | null;
}

export interface ParkingBboxResponse {
  places: ParkingMarker[];
  bbox: { sw: [number, number]; ne: [number, number] };
  cachedAt: string;
  ttlSec: number;
  /** 조회 실패로 빈 목록을 돌려준 경우 true — "이 지역에 없음"과 구분한다(ev/bbox 와 동일 규약). */
  degraded?: boolean;
}
