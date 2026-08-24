// 전국자동차검사소표준데이터(data.go.kr) — 서버 전용.
//
// 원천: https://www.data.go.kr/data/15021107/standard.do
//   오픈API: tn_pubr_public_car_inspofc_api
//   좌표(WGS84) 포함, 무료·활용신청 자동승인, 갱신주기 반기.
//
// 왜 별도 원천을 쓰는가: 지금까지 검사소는 정비업체 데이터에서 **업체명에 '검사'가 든 것만**
// 골라내고 있었고(lib/repair/brand.ts), 그 결과 34,172곳 중 121곳만 잡혔다.
// '○○모터스' 같은 지정정비사업자는 이름만으로 판별이 불가능하다.

import { fetchStandardPage, type StandardPage } from '@/lib/dataGoKr/standardApi';

export const INSPECTION_ENDPOINT = 'tn_pubr_public_car_inspofc_api';

/** 폭주 가드. 전국 검사소는 수천 행 규모. */
export const MAX_PAGES = 20;

/**
 * 표준데이터 응답 item.
 *
 * ⚠️ 전화번호가 두 개다 — 헷갈리면 관리 관청 번호를 검사소 번호로 표시하게 된다:
 *    - `inspofcPhoneNumber` = **검사소** 전화번호  ← 사용자에게 보여줄 값
 *    - `phoneNumber`        = **관리기관** 전화번호 ← 표시하지 않는다
 *    (정비업체 API 에서는 phoneNumber 가 업체 번호였다. 같은 이름, 다른 의미.)
 *
 * ⚠️ 운영시간이 정비소와 다르다 — 정비소는 시작/종료가 분리돼 있지만
 *    여기는 `operTime` 문자열 하나로 온다('09:00~18:00' 같은 자유 형식).
 */
export interface InspectionApiItem {
  inspofcNm?: string;              // 자동차검사소명
  inspofcType?: string;            // 자동차검사소유형(공단 직영/지정정비사업자 등)
  rdnmadr?: string;                // 소재지도로명주소
  lnmadr?: string;                 // 소재지지번주소
  latitude?: string;               // 위도(WGS84)
  longitude?: string;              // 경도(WGS84)
  inspofcPhoneNumber?: string;     // 검사소전화번호 ← 이걸 쓴다
  operTime?: string;               // 운영시간(자유 형식 문자열)
  inspofcCo?: string;              // 검사진로수(규모 지표)
  plotAr?: string;                 // 부지면적
  buldAr?: string;                 // 건물면적
  inspofcHnfCo?: string;           // 검사기술인력수
  newInspofcYn?: string;           // 신규검사여부
  fdrmInspofcYn?: string;          // 정기검사여부
  tuningInspofcYn?: string;        // 튜닝검사여부
  tempInspofcYn?: string;          // 임시검사여부
  repairInspofcYn?: string;        // 수리검사여부
  exhstGasInspofcYn?: string;      // 배출가스정밀검사여부
  taxiMeterYn?: string;            // 택시미터검정여부
  phoneNumber?: string;            // 관리기관전화번호 ← 표시 금지
  institutionNm?: string;          // 관리기관명
  referenceDate?: string;          // 데이터기준일자
  instt_code?: string;             // 제공기관코드
}

export function fetchInspectionPage(pageNo: number): Promise<StandardPage<InspectionApiItem>> {
  return fetchStandardPage<InspectionApiItem>(INSPECTION_ENDPOINT, pageNo);
}
