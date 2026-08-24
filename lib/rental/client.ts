// 전국렌터카업체정보표준데이터(data.go.kr) — 서버 전용.
//
// 원천: https://www.data.go.kr/data/15025689/standard.do
//   오픈API: tn_pubr_public_car_rental_api
//   좌표(WGS84) 포함, 무료·활용신청 자동승인, 갱신주기 반기, 169개 지자체 제공.
//
// 요청/응답 처리는 lib/dataGoKr/standardApi.ts 가 공통으로 담당한다.

import { fetchStandardPage, type StandardPage } from '@/lib/dataGoKr/standardApi';

export const RENTAL_ENDPOINT = 'tn_pubr_public_car_rental_api';

/** 한 번의 sync 가 부를 수 있는 총 호출 상한(폭주 가드). 전국 렌터카는 수천 행 규모라 충분하다. */
export const MAX_PAGES = 40;

/**
 * 표준데이터 응답 item. 필드명은 data.go.kr 문서에서 확인한 실제 값이다.
 *
 * ⚠️ 원천 문서의 오타를 그대로 따른다:
 *    - `weekdayOperColseHhmm` (Close 가 아니라 **Colse**)
 *    - `holidayCloseOpenHhmm` (Close 와 Open 이 뒤섞인 이름이지만 이게 '공휴일운영종료시각')
 *    고쳐 쓰면 값이 조용히 undefined 가 된다. 반드시 원문 철자를 유지할 것.
 */
export interface RentalApiItem {
  entrpsNm?: string;               // 업체명
  bplcType?: string;               // 사업장구분
  rdnmadr?: string;                // 소재지도로명주소
  lnmadr?: string;                 // 소재지지번주소
  latitude?: string;               // 위도(WGS84)
  longitude?: string;              // 경도(WGS84)
  garageRdnmadr?: string;          // 차고지도로명주소
  garageLnmadr?: string;           // 차고지지번주소
  garageAceptncCo?: string;        // 보유차고지수용능력
  vhcleHoldCo?: string;            // 자동차총보유대수
  carHoldCo?: string;              // 승용차보유대수
  vansHoldCo?: string;             // 승합차보유대수
  eleCarHoldCo?: string;           // 전기승용자동차보유대수
  eleVansCarHoldCo?: string;       // 전기승합자동차보유대수
  lghvhclChrge?: string;           // 경차요금
  cmhvhclChrge?: string;           // 소형차요금
  mdhvhclChrge?: string;           // 중형차요금
  lgshvhclChrge?: string;          // 대형차요금
  vahvhclChrge?: string;           // 승합차요금
  lshvhclChrge?: string;           // 레저용차요금
  imhvhclChrge?: string;           // 수입차요금
  weekdayOperOpenHhmm?: string;    // 평일운영시작시각
  weekdayOperColseHhmm?: string;   // 평일운영종료시각 (원문 오타 유지)
  wkendOperOpenHhmm?: string;      // 주말운영시작시각
  wkendOperCloseHhmm?: string;     // 주말운영종료시각
  holidayOperOpenHhmm?: string;    // 공휴일운영시작시각
  holidayCloseOpenHhmm?: string;   // 공휴일운영종료시각 (원문 이름 유지)
  rstde?: string;                  // 휴무일
  homepageUrl?: string;            // 홈페이지주소
  rprsntvNm?: string;              // 대표자명 — **적재하지 않는다**(개인정보, 표시 용도 없음)
  phoneNumber?: string;            // 전화번호
  referenceDate?: string;          // 데이터기준일자
  // ⚠️ 문서에는 instt_code 로 적혀 있으나 **실제 응답은 insttCode** 다(실측 확인).
  //    정비소 API 에서도 같은 함정이 있었다. 둘 다 선언해 어느 쪽이 와도 받는다.
  insttCode?: string;              // 제공기관코드(실측 필드명)
  instt_code?: string;             // 문서 표기 — 폴백
  insttNm?: string;                // 제공기관명(실측에 존재)
}

export function fetchRentalPage(pageNo: number): Promise<StandardPage<RentalApiItem>> {
  return fetchStandardPage<RentalApiItem>(RENTAL_ENDPOINT, pageNo);
}
