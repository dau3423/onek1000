// 한국도로공사 고속도로(휴게소) 주유소 가격 API 클라이언트 — 서버 전용.
// 인증키는 EX_API_KEY 환경변수로만 주입한다(코드/문서에 하드코딩 금지, NEXT_PUBLIC_ 금지).
// 1일 1회 sync에서만 호출하며(메모리 규칙: 외부 API는 sync에서만), 키가 없으면 graceful skip.
//
// API 스펙(curStateStation):
//  - GET https://data.ex.co.kr/openapi/business/curStateStation?key=...&type=json
//  - 페이지네이션: numOfRows/pageNo. 응답의 pageSize=전체 페이지수, count=전체 결과수.
//  - 가격 필드는 "1,998원" 같은 문자열이므로 숫자만 추출해 사용한다.
//  - 응답에 위경도가 없다(좌표는 sync에서 svarAddr 지오코딩으로 별도 확보).

import type { ProductCode } from '@/types/station';

const BASE = 'https://data.ex.co.kr/openapi/business/curStateStation';
// 한국도로공사 API(data.ex.co.kr)는 User-Agent 기반 WAF로 비브라우저 요청을 차단한다.
// Node fetch 기본 UA로 호출하면 "fetch failed"/"Request Blocked"가 발생하므로,
// 브라우저처럼 보이는 UA를 명시해 차단을 우회한다(실측: UA 없으면 400 차단, 있으면 정상 JSON).
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// 한 페이지 최대치를 크게 요청해도 서버가 ~99건으로 캡하므로(실측), pageSize(전체페이지수)를
// 신뢰해 페이지를 끝까지 순회한다.
const PAGE_ROWS = 100;
// 폭주/차단 방지용 안전 상한(휴게소 주유소는 수백 건 규모).
const MAX_PAGES = 30;

/** 고속도로 주유소 1건(원시 응답 → 정규화) */
export interface HighwayStation {
  /** serviceAreaCode2(휴게소/주유소코드). id 생성에 사용. */
  code: string;
  /** 휴게소/주유소명 */
  name: string;
  /** 노선명(예: 경부선) */
  routeName: string | null;
  /** 방향(예: 부산) */
  direction: string | null;
  /** 휴게소 주소 — 지오코딩 입력 */
  address: string | null;
  tel: string | null;
  /** 유종별 가격(원/L). 0/빈값은 제외. */
  prices: Partial<Record<ProductCode, number>>;
}

interface RawRow {
  serviceAreaCode2?: string;
  serviceAreaCode?: string;
  serviceAreaName?: string;
  routeName?: string;
  direction?: string;
  svarAddr?: string;
  telNo?: string;
  oilCompany?: string;
  lpgYn?: string;
  gasolinePrice?: string;
  diselPrice?: string;
  lpgPrice?: string;
}

interface RawResponse {
  list?: RawRow[];
  count?: number;
  pageNo?: number;
  numOfRows?: number;
  /** 전체 페이지 수(스펙상 pageSize 가 totalPages 의미) */
  pageSize?: number;
  code?: string;
  message?: string;
}

/** "1,998원" / "1998" / "" / null → 숫자(원). 유효 양수만, 아니면 null. */
function parsePrice(v?: string): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const trimOrNull = (v?: string): string | null => {
  const t = String(v ?? '').trim();
  return t.length > 0 ? t : null;
};

/** EX_API_KEY 존재 여부 — 미설정 시 고속도로 sync는 graceful skip. */
export function isExoilConfigured(): boolean {
  return Boolean(process.env.EX_API_KEY);
}

async function fetchPage(key: string, pageNo: number): Promise<RawResponse> {
  const url = new URL(BASE);
  url.searchParams.set('key', key);
  url.searchParams.set('type', 'json');
  url.searchParams.set('numOfRows', String(PAGE_ROWS));
  url.searchParams.set('pageNo', String(pageNo));

  // WAF 우회용 브라우저 UA + JSON Accept. 1일 1회 sync이므로 일시 실패에 1회만 가볍게 재시도.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/json',
        },
      });
      if (!res.ok) throw new Error(`ex curStateStation ${res.status}`);
      return (await res.json()) as RawResponse;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('ex curStateStation fetch failed');
}

/**
 * 고속도로 휴게소 주유소 전량 수집(모든 페이지). 가격이 하나도 없는 행은 제외한다.
 * 키 미설정이면 빈 배열(호출부에서 skip 처리).
 */
export async function fetchAllHighwayStations(): Promise<HighwayStation[]> {
  const key = process.env.EX_API_KEY;
  if (!key) return [];

  const out: HighwayStation[] = [];
  const seen = new Set<string>(); // serviceAreaCode2 중복 가드(혹시 모를 중복 행)

  // 1페이지로 전체 페이지수(pageSize) 파악 후 끝까지 순회.
  const first = await fetchPage(key, 1);
  const totalPages = Math.min(Math.max(Number(first.pageSize ?? 1), 1), MAX_PAGES);

  const collect = (resp: RawResponse) => {
    for (const r of resp.list ?? []) {
      const code = trimOrNull(r.serviceAreaCode2) ?? trimOrNull(r.serviceAreaCode);
      const name = trimOrNull(r.serviceAreaName);
      if (!code || !name) continue;
      if (seen.has(code)) continue;

      const prices: Partial<Record<ProductCode, number>> = {};
      const gas = parsePrice(r.gasolinePrice);
      const disel = parsePrice(r.diselPrice);
      const lpg = parsePrice(r.lpgPrice);
      if (gas) prices.B027 = gas;   // 휘발유
      if (disel) prices.D047 = disel; // 경유
      if (lpg) prices.C004 = lpg;   // LPG
      // 가격이 전혀 없으면 적재할 의미가 없어 제외(0/빈값 스킵).
      if (Object.keys(prices).length === 0) continue;

      seen.add(code);
      out.push({
        code,
        name,
        routeName: trimOrNull(r.routeName),
        direction: trimOrNull(r.direction),
        address: trimOrNull(r.svarAddr),
        tel: trimOrNull(r.telNo),
        prices,
      });
    }
  };

  collect(first);
  for (let p = 2; p <= totalPages; p++) {
    const resp = await fetchPage(key, p);
    collect(resp);
  }
  return out;
}
