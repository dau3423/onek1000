// 렌터카(자동차대여사업자) 도메인 타입
// 원천: 공공데이터포털 「전국렌터카업체정보표준데이터」
//       https://api.data.go.kr/openapi/tn_pubr_public_car_rental_api
//
// 정비소(types/repair.ts)·세차장(types/carwash.ts)과 병행 구조 — 지도 토글 레이어로 노출한다.
//
// 이 레이어가 다른 레이어와 다른 점: **요금**이 있다.
// 이 앱은 가격 비교가 정체성이라 요금을 전면에 쓰되, 원천이 반기 갱신이라 실제와 어긋날 수 있다.
// 그래서 요금을 보여주는 자리에는 항상 dataBaseDate('기준일')를 함께 표기한다
// — 오피넷 유가에 tradeDate 를 붙이는 것과 같은 규약이다.

/** 차종. 원천의 요금 컬럼(경차/소형/중형/대형/승합/레저용/수입차)과 1:1. */
export type RentalCarClass =
  | 'light'      // 경차
  | 'small'      // 소형
  | 'medium'     // 중형
  | 'large'      // 대형
  | 'van'        // 승합
  | 'leisure'    // 레저용(RV/SUV)
  | 'imported';  // 수입차

export const RENTAL_CAR_CLASSES: readonly RentalCarClass[] = [
  'light', 'small', 'medium', 'large', 'van', 'leisure', 'imported',
] as const;

/**
 * 지도 필터 값.
 *  all = 전체(기본)
 *  ev  = 전기차 보유 업체만 — 원천에 전기승용/전기승합 보유대수가 따로 있어 정확히 판별된다.
 * 요금대 필터는 넣지 않는다: 원천 요금이 비어 있는 업체가 흔해서, 요금으로 거르면
 * "요금 미기재"라는 이유만으로 멀쩡한 업체가 지도에서 사라진다.
 */
export type RentalFilter = 'all' | 'ev';

/** 차종별 요금(원). 원천이 비워 두는 경우가 흔해 전부 nullable. */
export type RentalFees = Partial<Record<RentalCarClass, number>>;

/** 지도 마커 1개 = 렌터카 업체(place_key) 단위. rpc_rental_by_bbox 반환에 대응. */
export interface RentalMarker {
  placeKey: string;
  name: string;
  /** 사업장구분 원문(본사/영업소 등). 표기 통일이 안 돼 있어 그대로 보존만 한다. */
  bizKind?: string | null;
  roadAddr: string | null;
  jibunAddr: string | null;
  tel?: string | null;
  homepage?: string | null;
  /** 보유 대수. 원천이 비워 둘 수 있다. */
  totalCars?: number | null;
  evCars: number;              // 전기승용 + 전기승합(합산). 0 이면 전기차 없음.
  /** 차종별 요금 — 값이 있는 차종만 담긴다. */
  fees: RentalFees;
  lat: number;
  lng: number;
  /** 요금·보유대수의 기준일(YYYY-MM-DD). 화면에서 요금 옆에 반드시 함께 보여준다. */
  dataBaseDate?: string | null;
  syncedAt?: string | null;
}

export interface RentalBboxResponse {
  places: RentalMarker[];
  bbox: { sw: [number, number]; ne: [number, number] };
  cachedAt: string;
  ttlSec: number;
}

/** 렌터카 상세(단건) — 마커 필드 + 운영시간/차고지(상세에서만 노출). */
export interface RentalDetail extends RentalMarker {
  /** 평일/주말/공휴일 운영시간. 원천이 셋을 따로 준다. */
  weekdayOpen?: string | null;
  weekdayClose?: string | null;
  weekendOpen?: string | null;
  weekendClose?: string | null;
  holidayOpen?: string | null;
  holidayClose?: string | null;
  /** 휴무일 원문(예: '연중무휴', '일요일'). 표기가 제각각이라 가공 없이 그대로 보여준다. */
  holiday?: string | null;
  sedanCars?: number | null;
  vanCars?: number | null;
  evSedanCars?: number | null;
  evVanCars?: number | null;
}

/** 마커 색 — 다른 레이어와 겹치지 않게. EV 초록/세차장 청보라/정비소 갈색/주유소 tier(적황녹)를 피한다. */
export const RENTAL_COLOR = '#0D9488';       // teal — 렌터카 기본
export const RENTAL_EV_COLOR = '#7C3AED';    // violet — 전기차 보유 업체 강조

/** 표시할 대표 요금 1개를 고른다. 저렴한 차종부터 훑어 처음 값이 있는 것. */
export function primaryFee(fees: RentalFees): { carClass: RentalCarClass; price: number } | null {
  for (const c of RENTAL_CAR_CLASSES) {
    const v = fees[c];
    if (typeof v === 'number' && v > 0) return { carClass: c, price: v };
  }
  return null;
}
