// 내 기록 도메인 타입 (주유 + 전기차 충전 통합)
// 상세에서 1클릭으로 저장하고(주유소/충전소·시각·단가·유종 자동), 금액·주유량(kWh)·주행거리·메모는 나중에 편집한다.
import type { ProductCode } from './station';

/** 기록 종류: 'gas'=주유(기본), 'ev'=전기차 충전 */
export type FuelLogKind = 'gas' | 'ev';

/** 기록 1건 (클라이언트 노출용). EV는 product 무의미, kwh/단가(원/kWh)를 사용한다. */
export interface FuelLog {
  id: string;
  /** 기록 종류 */
  kind: FuelLogKind;
  /** 주유소/충전소 ID(EV는 statId) */
  stationId: string;
  /** 주유소/충전소명(스냅샷) */
  stationName: string;
  /** 유종 코드(주유 전용. EV는 placeholder) */
  product: ProductCode;
  /** 기록 시점 단가(주유 원/L, EV 원/kWh). 우리 DB에 값이 없으면 null */
  unitPrice: number | null;
  /** 결제/충전 금액(원). 나중 편집(선택) */
  amountWon: number | null;
  /** 주유량(L). 주유 전용. 나중 편집(선택) */
  liters: number | null;
  /** 충전량(kWh). EV 전용. 나중 편집(선택) */
  kwh: number | null;
  /** 주행거리(km). 나중 편집(선택) */
  odometer: number | null;
  /** 메모. 나중 편집(선택) */
  memo: string | null;
  /** 주유/충전 시각(ISO) */
  loggedAt: string;
  createdAt: string;
}

/** 1클릭 생성 요청 바디(최소: stationId. 단가/유종/시각은 서버가 보강) */
export interface FuelLogCreateInput {
  stationId: string;
}

/** 편집 요청 바디(모두 선택, null 허용) */
export interface FuelLogPatchInput {
  amountWon?: number | null;
  liters?: number | null;
  kwh?: number | null;
  odometer?: number | null;
  memo?: string | null;
}

/** 내가 주유한 주유소(distinct) — 지도 핀 표시용. 좌표는 stations 조인. */
export interface FuelLogStation {
  /** 주유소/충전소 ID(= Opinet UNI_ID / statId) */
  stationId: string;
  /** 주유소/충전소명(스냅샷) */
  stationName: string;
  /** 위도(stations 조인). 좌표 없으면 null → 핀 제외 */
  lat: number | null;
  /** 경도(stations 조인) */
  lng: number | null;
  /** 방문(기록) 횟수 */
  visitCount: number;
  /** 마지막 방문 시각(ISO) */
  lastLoggedAt: string;
}

/** 기록 목록 간단 통계 */
export interface FuelLogStats {
  count: number;
  /** amount_won 합(원). 금액 입력된 기록만 합산 */
  totalSpent: number;
  /** 평균 단가. unit_price 있는 기록만 평균. 없으면 null */
  avgUnitPrice: number | null;
}
