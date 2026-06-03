// 한국환경공단 전기차 충전소 정보(data.go.kr EvCharger) 클라이언트 — 서버 전용.
// 인증키는 env EV_CHARGER_API_KEY 로만 읽는다(NEXT_PUBLIC_ 금지). sync 라우트에서만 사용한다.
//
// 주의: zcode 필터 없이 전국을 한 번에 호출하면 504 타임아웃이 발생한다(실측).
// 반드시 시도(zcode)별로 페이지네이션해 호출한다.

const EV_BASE = 'https://apis.data.go.kr/B552584/EvCharger';

/** 시도 zcode 17개 (data.go.kr 기준). */
export const EV_ZCODES = [
  '11', '26', '27', '28', '29', '30', '31', '36',
  '41', '51', '43', '44', '52', '46', '47', '48', '50',
] as const;
export type EvZcode = (typeof EV_ZCODES)[number];

/** getChargerInfo 응답 item (실측 필드). data.go.kr JSON은 빈 값을 "null" 문자열로 줄 때가 있다. */
export interface EvChargerInfoItem {
  statNm?: string;
  statId?: string;
  chgerId?: string;
  chgerType?: string;
  addr?: string;
  addrDetail?: string;
  lat?: string;
  lng?: string;
  useTime?: string;
  busiId?: string;
  busiNm?: string;
  busiCall?: string;
  output?: string;
  method?: string;
  stat?: string;
  statUpdDt?: string;       // yyyyMMddHHmmss
  lastTsdt?: string;
  lastTedt?: string;
  zcode?: string;
  zscode?: string;
  kind?: string;
  kindDetail?: string;
  parkingFree?: string;     // Y/N
  limitYn?: string;         // Y/N
  delYn?: string;           // Y/N
  year?: string;
  floorNum?: string;
  floorType?: string;
  maker?: string;
}

// EvCharger(dataType=JSON)의 실제 응답은 표준 data.go.kr 래퍼(response.header/body)가 없는
// "최상위 플랫" 구조다. 즉 resultCode/resultMsg/totalCount/items가 모두 최상위에 온다.
//   { resultMsg:"NORMAL SERVICE.", totalCount:6424, pageNo:1, numOfRows:1500, items:{ item:[...] } }
// 성공 응답엔 resultCode가 없을 수 있고(있으면 '00'), items.item이 배열(단건이면 객체)이다.
// 만일을 대비해 래퍼(response.body) 형태도 폴백으로 받아들인다(실제는 플랫).
interface EvChargerInfoBody {
  resultCode?: string;
  resultMsg?: string;
  items?: { item?: EvChargerInfoItem[] | EvChargerInfoItem } | EvChargerInfoItem[];
  totalCount?: number | string;
  pageNo?: number | string;
  numOfRows?: number | string;
}

interface EvChargerInfoResponse extends EvChargerInfoBody {
  // 하위호환: 혹시 표준 래퍼로 오는 경우 대비(실제 EvCharger는 플랫).
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: EvChargerInfoBody;
  };
}

/** "null"/""/공백을 모두 빈 값으로 정규화. */
export function evNorm(v?: string | null): string | null {
  const t = String(v ?? '').trim();
  if (!t || t.toLowerCase() === 'null') return null;
  return t;
}

/** Y/N → boolean(null 허용) */
export function evYn(v?: string | null): boolean | null {
  const t = evNorm(v);
  if (t == null) return null;
  return t.toUpperCase() === 'Y';
}

/** yyyyMMddHHmmss → ISO 문자열(KST 가정, 로컬 타임존 무관하게 +09:00로 해석). 실패 시 null. */
export function evDateToIso(v?: string | null): string | null {
  const t = evNorm(v);
  if (!t || t.length < 8) return null;
  const y = t.slice(0, 4);
  const mo = t.slice(4, 6);
  const d = t.slice(6, 8);
  const h = t.slice(8, 10) || '00';
  const mi = t.slice(10, 12) || '00';
  const s = t.slice(12, 14) || '00';
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** 플랫(최상위) 우선, 없으면 래퍼(response.body) 폴백으로 body를 고른다. */
function bodyOf(data: EvChargerInfoResponse): EvChargerInfoBody {
  // 플랫 응답은 items가 최상위에 존재한다. 래퍼 응답이면 response.body로 폴백.
  if (data?.items != null || data?.totalCount != null || data?.resultMsg != null) return data;
  return data?.response?.body ?? data;
}

function itemsOf(data: EvChargerInfoResponse): EvChargerInfoItem[] {
  const body = bodyOf(data);
  // items가 배열이거나 { item: ... } 둘 다 대응. item은 단건이면 객체로 온다.
  const raw = Array.isArray(body.items) ? body.items : body.items?.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export interface EvChargerInfoPage {
  items: EvChargerInfoItem[];
  totalCount: number;
}

/**
 * getChargerInfo 1페이지 조회 (시도 zcode 필터 필수).
 * timeoutMs 초과 시 abort. data.go.kr 한도/타임아웃 대비로 sync에서 재시도와 함께 사용한다.
 */
export async function evGetChargerInfo(opts: {
  zcode: string;
  pageNo: number;
  numOfRows: number;
  timeoutMs?: number;
}): Promise<EvChargerInfoPage> {
  const key = process.env.EV_CHARGER_API_KEY;
  if (!key) throw new Error('EV_CHARGER_API_KEY missing');

  const params = new URLSearchParams({
    serviceKey: key,                 // hex 키(특수문자 없음) — 그대로 전달
    pageNo: String(opts.pageNo),
    numOfRows: String(opts.numOfRows),
    zcode: opts.zcode,
    dataType: 'JSON',
  });
  const url = `${EV_BASE}/getChargerInfo?${params.toString()}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`EvCharger ${res.status}`);
    const data = (await res.json()) as EvChargerInfoResponse;
    const body = bodyOf(data);
    // resultCode는 플랫 최상위(또는 래퍼 header)에 있을 수 있고, 성공 응답엔 아예 없을 수도 있다.
    // 있고 '00'이 아니면(한도초과/키오류 등) 메시지와 함께 throw. 없으면 통과.
    const code = body.resultCode ?? data?.response?.header?.resultCode;
    const msg = body.resultMsg ?? data?.response?.header?.resultMsg ?? '';
    if (code && code !== '00') {
      throw new Error(`EvCharger result ${code}: ${msg}`);
    }
    // resultCode가 없더라도 명백한 에러 메시지(키 오류/한도 등)는 방어적으로 throw.
    // 정상 메시지는 "NORMAL SERVICE." 이므로, 그 외에 에러성 키워드가 보이면 실패로 본다.
    if (!code && msg && /SERVICE[_ ]?KEY|LIMITED|ERROR|DENIED|UNREGISTERED|EXPIRED/i.test(msg)) {
      throw new Error(`EvCharger error: ${msg}`);
    }
    const total = Number(body.totalCount ?? 0);
    return { items: itemsOf(data), totalCount: Number.isFinite(total) ? total : 0 };
  } finally {
    clearTimeout(timer);
  }
}
