// 한국도로공사 고속도로(휴게소) 주유소 가격 API 클라이언트 — 서버 전용.
// === lib/exoil/client.ts 에서 포팅(self-contained, alias/타입 제거) ===
// 인증키는 EX_API_KEY 환경변수로만 주입한다(코드/문서에 하드코딩 금지).
// 가격 필드는 "1,998원" 같은 문자열이므로 숫자만 추출. 응답에 위경도는 없다.
//
// 이 서비스가 서울 Cloud Run에 따로 떠 있는 이유: data.ex.co.kr 은 해외 IP를 차단하므로
// 싱가포르 App Hosting(/api/internal/sync-highway)에서는 항상 fetch failed 가 난다.

const BASE = 'https://data.ex.co.kr/openapi/business/curStateStation';
// 도로공사 API는 User-Agent 기반 WAF로 비브라우저 요청을 차단한다. 브라우저 UA로 우회.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// 한 페이지 최대치를 크게 요청해도 서버가 ~99건으로 캡하므로 pageSize(전체페이지수)로 순회.
const PAGE_ROWS = 100;
// 폭주/차단 방지용 안전 상한.
const MAX_PAGES = 30;

/** "1,998원" / "1998" / "" / null → 숫자(원). 유효 양수만, 아니면 null. */
function parsePrice(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function trimOrNull(v) {
  const t = String(v ?? '').trim();
  return t.length > 0 ? t : null;
}

/** EX_API_KEY 존재 여부. */
export function isExoilConfigured() {
  return Boolean(process.env.EX_API_KEY);
}

async function fetchPage(key, pageNo) {
  const url = new URL(BASE);
  url.searchParams.set('key', key);
  url.searchParams.set('type', 'json');
  url.searchParams.set('numOfRows', String(PAGE_ROWS));
  url.searchParams.set('pageNo', String(pageNo));

  // 브라우저 UA + JSON Accept. 1일 1회 sync이므로 일시 실패에 1회만 가볍게 재시도.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`ex curStateStation ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('ex curStateStation fetch failed');
}

/**
 * 고속도로 휴게소 주유소 전량 수집(모든 페이지). 가격이 하나도 없는 행은 제외.
 * 반환: [{ code, name, routeName, direction, address, tel, prices:{B027,D047,C004} }]
 */
export async function fetchAllHighwayStations() {
  const key = process.env.EX_API_KEY;
  if (!key) return [];

  const out = [];
  const seen = new Set(); // serviceAreaCode2 중복 가드

  const first = await fetchPage(key, 1);
  const totalPages = Math.min(Math.max(Number(first.pageSize ?? 1), 1), MAX_PAGES);

  const collect = (resp) => {
    for (const r of resp.list ?? []) {
      const code = trimOrNull(r.serviceAreaCode2) ?? trimOrNull(r.serviceAreaCode);
      const name = trimOrNull(r.serviceAreaName);
      if (!code || !name) continue;
      if (seen.has(code)) continue;

      const prices = {};
      const gas = parsePrice(r.gasolinePrice);
      const disel = parsePrice(r.diselPrice);
      const lpg = parsePrice(r.lpgPrice);
      if (gas) prices.B027 = gas; // 휘발유
      if (disel) prices.D047 = disel; // 경유
      if (lpg) prices.C004 = lpg; // LPG
      if (Object.keys(prices).length === 0) continue; // 가격 전무면 제외

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
    collect(await fetchPage(key, p));
  }
  return out;
}
