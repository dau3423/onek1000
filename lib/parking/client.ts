// 전국주차장정보표준데이터(data.go.kr) — 서버 전용.
//
// 원천 오픈API: tn_pubr_prkplce_info_api
//   2026-09-05 실측 — 전체 18,878건, resultCode 00, 기존 DATA_GO_KR_API_KEY 로 열림(활용신청 완료 상태).
//   ⚠️ 기획서(plan §3)가 확인한 대로 `tn_pubr_public_prkplce_info_api`(public_ 포함)는 **없는 API** 다
//      (NO_OPENAPI_SERVICE_ERROR). 이름이 비슷해 잘못 쓰기 쉽다.
//
// 요청/응답 처리는 lib/dataGoKr/standardApi.ts 가 공통으로 담당한다.

import { fetchStandardPage, type StandardPage } from '@/lib/dataGoKr/standardApi';

export const PARKING_ENDPOINT = 'tn_pubr_prkplce_info_api';

/** 한 번의 sync 가 부를 수 있는 총 호출 상한(폭주 가드).
 *  18,878건 / PAGE_SIZE(1000) = 19페이지. 원천이 늘어날 여지를 두고 넉넉히 잡는다. */
export const MAX_PAGES = 40;

/**
 * 표준데이터 응답 item. 2026-09-05 실측 응답의 필드명을 그대로 옮겼다(34개).
 *
 * ⚠️ 원천 문서/응답의 오타를 그대로 따른다 — 고쳐 쓰면 값이 조용히 undefined 가 된다:
 *    - `weekdayOperColseHhmm`  (Close 가 아니라 **Colse**)
 *    - `satOperOperOpenHhmm`   (Oper 가 **두 번**)
 *    - `holidayCloseOpenHhmm`  (Close 와 Open 이 뒤섞였지만 이게 '공휴일운영종료시각')
 *    렌터카 client 에서도 같은 함정을 겪었다.
 */
export interface ParkingApiItem {
  prkplceNo?: string;              // 주차장관리번호
  prkplceNm?: string;              // 주차장명
  prkplceSe?: string;              // 주차장구분(공영/민영)
  prkplceType?: string;            // 주차장유형(노상/노외/부설)
  rdnmadr?: string;                // 소재지도로명주소
  lnmadr?: string;                 // 소재지지번주소
  prkcmprt?: string;               // 주차구획수
  feedingSe?: string;              // 급지구분
  enforceSe?: string;              // 부제시행구분
  operDay?: string;                // 운영요일
  weekdayOperOpenHhmm?: string;    // 평일운영시작시각
  weekdayOperColseHhmm?: string;   // 평일운영종료시각 (원문 오타 유지)
  satOperOperOpenHhmm?: string;    // 토요일운영시작시각 (원문 오타 유지)
  satOperCloseHhmm?: string;       // 토요일운영종료시각
  holidayOperOpenHhmm?: string;    // 공휴일운영시작시각
  holidayCloseOpenHhmm?: string;   // 공휴일운영종료시각 (원문 이름 유지)
  parkingchrgeInfo?: string;       // 요금정보(무료/유료/혼합)
  basicTime?: string;              // 주차기본시간(분)
  basicCharge?: string;            // 주차기본요금
  addUnitTime?: string;            // 추가단위시간(분)
  addUnitCharge?: string;          // 추가단위요금
  dayCmmtktAdjTime?: string;       // 1일주차권요금적용시간
  dayCmmtkt?: string;              // 1일주차권요금
  monthCmmtkt?: string;            // 월정기권요금
  metpay?: string;                 // 결제방법
  spcmnt?: string;                 // 특기사항
  institutionNm?: string;          // 관리기관명
  phoneNumber?: string;            // 전화번호
  latitude?: string;               // 위도(WGS84)
  longitude?: string;              // 경도(WGS84)
  pwdbsPpkZoneYn?: string;         // 장애인전용주차구역보유여부(Y/N)
  referenceDate?: string;          // 데이터기준일자
  insttCode?: string;              // 제공기관코드
  insttNm?: string;                // 제공기관명
}

export function fetchParkingPage(pageNo: number): Promise<StandardPage<ParkingApiItem>> {
  return fetchStandardPage<ParkingApiItem>(PARKING_ENDPOINT, pageNo);
}
