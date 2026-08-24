// 공공데이터포털 「표준데이터」 계열 오픈API 공통 클라이언트 — 서버 전용.
//
// 표준데이터는 엔드포인트만 다를 뿐 요청/응답 규약이 같다(pageNo·numOfRows·type=json,
// {header, body:{items,totalCount}}). 정비소(lib/repair/client.ts)에서 한 번 겪은 함정들을
// 여기 모아 두고, 이후 레이어(렌터카·검사소)는 엔드포인트와 item 타입만 지정해 재사용한다.
//
// ⚠️ lib/repair/client.ts 는 이 모듈로 옮기지 않았다 — 운영 중이고 이미 검증된 코드를
//    새 레이어 작업과 함께 건드리면 실패 시 원인 분리가 안 된다. 나중에 별도로 옮긴다.
//
// 인증키: env DATA_GO_KR_API_KEY 로만 읽는다(NEXT_PUBLIC_ 금지). sync 경로에서만 쓴다.
// data.go.kr 인증키는 계정당 1개라 EV_CHARGER_API_KEY 와 같은 값일 수 있어 폴백을 둔다.
//
// ⚠️ API 별로 **활용신청이 따로** 필요하다. 키가 있어도 그 API 를 신청하지 않았으면
//    SERVICE_KEY_IS_NOT_REGISTERED 가 온다 — 키 문제로 오해하기 쉬우니 에러 문구에 명시한다.

/** 페이지당 행 수 — 표준데이터 공통 상한. */
export const PAGE_SIZE = 1000;

const PAGE_TIMEOUT_MS = 30_000;

export function getApiKey(): string | null {
  const key = process.env.DATA_GO_KR_API_KEY || process.env.EV_CHARGER_API_KEY || '';
  return key.length > 0 ? key : null;
}

export function isDataGoKrConfigured(): boolean {
  return getApiKey() !== null;
}

interface EnvelopeInner {
  header?: { resultCode?: string; resultMsg?: string };
  body?: unknown;
}
interface Envelope extends EnvelopeInner {
  response?: EnvelopeInner;
}

export interface StandardPage<T> {
  items: T[];
  totalCount: number;
}

/**
 * items 추출 — 같은 API 도 건수에 따라 배열/단일객체로 흔들린다.
 * 표준데이터는 body.items 가 평평한 배열인 경우가 많지만 body.items.item 형태도 존재한다.
 * 하나만 가정하면 조용히 0건이 되고 sync 는 그걸 "완주"로 오해한다 — 세 형태를 모두 받는다.
 */
function extractItems<T>(body: unknown): T[] {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as Record<string, unknown>).items;
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const inner = (raw as Record<string, unknown>).item;
    if (Array.isArray(inner)) return inner as T[];
    if (inner && typeof inner === 'object') return [inner as T];
  }
  return [];
}

function extractTotal(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const n = Number((body as Record<string, unknown>).totalCount);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 표준데이터 한 페이지 조회.
 * 실패 시 throw — 호출부(sync)가 부분 실패로 처리해 기존 스냅샷을 지키게 한다
 * (전체 삭제 후 재삽입은 절대 하지 않는다는 원칙).
 *
 * @param endpoint api.data.go.kr/openapi/ 뒤에 붙는 경로 (예: 'tn_pubr_public_car_rental_api')
 */
export async function fetchStandardPage<T>(endpoint: string, pageNo: number): Promise<StandardPage<T>> {
  const key = getApiKey();
  if (!key) throw new Error('DATA_GO_KR_API_KEY (또는 EV_CHARGER_API_KEY) 미설정');

  // serviceKey 는 이미 URL 인코딩된 값일 수도, 디코딩된 값일 수도 있다(data.go.kr 이 둘 다 발급).
  // URLSearchParams 에 넣으면 인코딩본이 이중 인코딩되므로 직접 붙인다.
  const params = new URLSearchParams({
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
    type: 'json',
  });
  const url = `https://api.data.go.kr/openapi/${endpoint}?serviceKey=${key}&${params}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: 'no-store' });
    const text = await res.text();

    // ⚠️ 인증키 판정을 res.ok 검사보다 **먼저** 한다.
    //    미신청 키는 403 으로도 오고 200 봉투로도 온다 — 순서를 바꾸면 실제 원인(활용신청 누락)이
    //    'HTTP 403' 이라는 쓸모없는 메시지에 가려진다.
    if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED') || text.includes('SERVICE_KEY_IS_NULL')) {
      throw new Error(`인증키 오류: data.go.kr 에서 '${endpoint}' 활용신청이 승인됐는지 확인 필요(API 마다 별도 신청)`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (text.trimStart().startsWith('<')) {
      throw new Error(`JSON 이 아닌 응답(XML 에러 추정): ${text.slice(0, 200)}`);
    }

    // 봉투 형태가 API 마다 다르다 — {response:{header,body}} 와 {header,body} 가 둘 다 존재한다
    // (정비소는 후자였다). 둘 다 받지 않으면 body 가 undefined 가 되어 조용히 0건이 된다.
    const json = JSON.parse(text) as Envelope;
    const env: EnvelopeInner = json.response ?? json;
    if (env.header?.resultCode && env.header.resultCode !== '00') {
      throw new Error(`API 오류 ${env.header.resultCode}: ${env.header.resultMsg ?? ''}`);
    }
    return { items: extractItems<T>(env.body), totalCount: extractTotal(env.body) };
  } finally {
    clearTimeout(timer);
  }
}

// ── 값 정규화 헬퍼 (표준데이터 공통) ───────────────────────────────────────────

/** data.go.kr 은 빈 값을 ''·'null'·공백으로 준다 — 전부 null 로 접는다. */
export function nullify(v: string | undefined | null): string | null {
  const s = (v ?? '').trim();
  if (s.length === 0 || s.toLowerCase() === 'null') return null;
  return s;
}

/** 'YYYYMMDD' 또는 'YYYY-MM-DD' → 'YYYY-MM-DD'. 그 외는 null. */
export function toDate(v: string | undefined | null): string | null {
  const s = nullify(v);
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const y = digits.slice(0, 4), m = digits.slice(4, 6), d = digits.slice(6, 8);
  if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${m}-${d}`;
}

/** 숫자 필드 → number | null. 쉼표(1,200)와 단위 섞임을 견딘다. */
export function toInt(v: string | number | undefined | null): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const s = nullify(typeof v === 'string' ? v : null);
  if (!s) return null;
  const digits = s.replace(/[^0-9-]/g, '');
  if (digits.length === 0) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** 'Y'/'N'/'여'/'1' 등 → boolean | null. 판단 불가면 null(모른다는 뜻을 살린다). */
export function toBool(v: string | undefined | null): boolean | null {
  const s = nullify(v);
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === 'Y' || u === 'YES' || u === '1' || u === 'TRUE' || s === '여' || s === '가능') return true;
  if (u === 'N' || u === 'NO' || u === '0' || u === 'FALSE' || s === '부' || s === '불가') return false;
  return null;
}

/** 한반도 bbox 가드(좌표 이상치 드랍) — 다른 레이어 sync 와 동일 기준. */
export const KR_LAT_MIN = 33;
export const KR_LAT_MAX = 39;
export const KR_LNG_MIN = 124;
export const KR_LNG_MAX = 132;

export function isValidKrCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= KR_LAT_MIN && lat <= KR_LAT_MAX &&
    lng >= KR_LNG_MIN && lng <= KR_LNG_MAX
  );
}
