// 전국자동차정비업체표준데이터(data.go.kr) 클라이언트 — 서버 전용.
// 인증키는 env DATA_GO_KR_API_KEY 로만 읽는다(NEXT_PUBLIC_ 금지). sync 라우트에서만 사용한다.
//
// 원천: https://www.data.go.kr/data/15028204/standard.do
//   - 좌표(WGS84) 채움률 100%, 이용허락범위 제한 없음, 무료, 활용신청 자동승인
//   - 전국 약 3.7만행. numOfRows 최대 1000 → 약 37콜이면 전량 수집
//   - 갱신주기 반기(기관별로 다름)
//
// data.go.kr 인증키는 계정당 1개라, 이미 쓰고 있는 EV_CHARGER_API_KEY 와 같은 값일 수 있다.
// 그래서 DATA_GO_KR_API_KEY 가 없으면 EV_CHARGER_API_KEY 로 폴백한다(둘 다 없으면 미설정).

const BASE = 'https://api.data.go.kr/openapi/tn_pubr_public_auto_maintenance_company_api';

/** 페이지당 행 수 — 이 API 의 상한. */
export const PAGE_SIZE = 1000;

/** 한 번의 sync 가 부를 수 있는 총 호출 상한(폭주 가드). 3.7만행이면 약 37콜이라 충분히 여유. */
export const MAX_PAGES = 80;

const PAGE_TIMEOUT_MS = 30_000;

export function getApiKey(): string | null {
  const key = process.env.DATA_GO_KR_API_KEY || process.env.EV_CHARGER_API_KEY || '';
  return key.length > 0 ? key : null;
}

export function isRepairApiConfigured(): boolean {
  return getApiKey() !== null;
}

/** 표준데이터 응답 item (data.go.kr 문서 기준 필드명). 값은 전부 문자열로 온다. */
export interface RepairApiItem {
  inspofcNm?: string;              // 자동차정비업체명
  inspofcType?: string;            // 자동차정비업체종류(코드)
  rdnmadr?: string;                // 소재지도로명주소
  lnmadr?: string;                 // 소재지지번주소
  latitude?: string;               // 위도(WGS84)
  longitude?: string;              // 경도(WGS84)
  bizrnoDate?: string;             // 사업등록일자
  ar?: string;                     // 면적
  bsnSttus?: string;               // 영업상태(코드)
  clsbizDate?: string;             // 폐업일자
  sssBeginDate?: string;           // 휴업시작일자
  sssEndDate?: string;             // 휴업종료일자
  operOpenHm?: string;             // 운영시작시각
  operCloseHm?: string;            // 운영종료시각
  phoneNumber?: string;            // 전화번호
  institutionNm?: string;          // 관리기관명
  institutionPhoneNumber?: string; // 관리기관전화번호
  referenceDate?: string;          // 데이터기준일자
  insttCode?: string;              // 기관코드 (실측 필드명)
  instt_code?: string;             // 문서 표기 — 실제 응답엔 없지만 폴백으로 남긴다
  insttNm?: string;                // 기관명(실측에 존재, institutionNm 과 별개)
}

interface EnvelopeInner {
  header?: { resultCode?: string; resultMsg?: string };
  body?: unknown;
}
interface Envelope extends EnvelopeInner {
  response?: EnvelopeInner;
}

export interface RepairPage {
  items: RepairApiItem[];
  totalCount: number;
}

/**
 * items 추출 — data.go.kr 응답 구조가 API 마다 다르고, 같은 API 도 건수에 따라
 * 배열/단일객체로 흔들린다. 표준데이터 계열은 body.items 가 평평한 배열인 경우가 많지만
 * body.items.item 형태도 존재한다. 실제 응답을 볼 수 없는 상태에서 하나만 가정하면
 * 조용히 0건이 되므로 세 형태를 모두 받아들인다.
 */
function extractItems(body: unknown): RepairApiItem[] {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as Record<string, unknown>).items;
  if (Array.isArray(raw)) return raw as RepairApiItem[];
  if (raw && typeof raw === 'object') {
    const inner = (raw as Record<string, unknown>).item;
    if (Array.isArray(inner)) return inner as RepairApiItem[];
    if (inner && typeof inner === 'object') return [inner as RepairApiItem];
  }
  return [];
}

function extractTotal(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const n = Number((body as Record<string, unknown>).totalCount);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 한 페이지 조회. 실패 시 throw — 호출부(sync)가 부분 실패로 처리해
 * 기존 스냅샷을 지키도록 한다(전체 교체 금지 원칙).
 */
export async function fetchRepairPage(pageNo: number): Promise<RepairPage> {
  const key = getApiKey();
  if (!key) throw new Error('DATA_GO_KR_API_KEY (또는 EV_CHARGER_API_KEY) 미설정');

  // serviceKey 는 이미 URL 인코딩된 값일 수도, 디코딩된 값일 수도 있다(data.go.kr 이 둘 다 발급).
  // URLSearchParams 에 넣으면 인코딩본이 이중 인코딩되므로 직접 붙인다.
  const params = new URLSearchParams({
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
    type: 'json',
  });
  const url = `${BASE}?serviceKey=${key}&${params}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

    // 인증 실패 등은 200 으로 XML/JSON 에러 봉투를 주기도 한다 — 파싱 전에 걸러낸다.
    if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED') || text.includes('SERVICE_KEY_IS_NULL')) {
      throw new Error('인증키 오류: data.go.kr 에서 이 API 활용신청이 승인됐는지 확인 필요');
    }
    if (text.trimStart().startsWith('<')) {
      throw new Error(`JSON 이 아닌 응답(XML 에러 추정): ${text.slice(0, 200)}`);
    }

    // 봉투 형태가 API 마다 다르다. 이 API 는 실측 결과 **response 래퍼가 없는** {header, body} 다
    // (문서/다른 data.go.kr API 는 {response:{header,body}}). 둘 다 받아들이지 않으면
    // body 가 undefined 가 되어 조용히 0건이 되고, sync 는 "완주"로 판단해 정상 종료해 버린다.
    const json = JSON.parse(text) as Envelope;
    const env: EnvelopeInner = json.response ?? json;
    const header = env.header;
    if (header?.resultCode && header.resultCode !== '00') {
      throw new Error(`API 오류 ${header.resultCode}: ${header.resultMsg ?? ''}`);
    }
    const body = env.body;
    return { items: extractItems(body), totalCount: extractTotal(body) };
  } finally {
    clearTimeout(timer);
  }
}
