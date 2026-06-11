// 주유 타이밍 예측용 시장 데이터 클라이언트 — 서버 전용.
//
// Opinet 무료 오픈API엔 국제유가/장기시계열이 없어, 오피넷 웹의 CSV export 엔드포인트를
// 직접 호출해 cp949 CSV 시계열을 받는다. ⚠️ 반드시 해당 Select.do 페이지를 GET으로 먼저
// 호출해 세션 쿠키(JSESSIONID 등)를 워밍한 뒤 _csv.do 를 POST 해야 데이터가 나온다.
//
// 이 클라이언트는 API 키가 필요 없다(Opinet 웹 세션 + Yahoo 공개 JSON). 외부 호출이므로
// 1일 1회 sync(/api/internal/sync-market)에서만 사용한다(상세/조회 실시간 호출 금지).
//
// 인코딩: cp949(=euc-kr superset). Node TextDecoder 는 'cp949' 라벨을 모르지만 'euc-kr'
//   디코더가 cp949 영역까지 처리하므로 'euc-kr'로 디코딩한다.
// 날짜표기: '25년01월02일' / '2026년06월09일' (연도 2/4자리 혼재) → ISO(YYYY-MM-DD).

const OPINET_WEB = 'https://www.opinet.co.kr';

// 비브라우저 요청 차단/세션 이슈를 피하기 위한 공통 UA.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── 공통 유틸 ───

/** YYYYMMDD 문자열 생성(KST 기준 날짜). */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** N일 전 Date. */
export function daysAgo(n: number, base = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Opinet CSV의 한국어 날짜('25년01월02일' / '2026년06월09일')를 ISO(YYYY-MM-DD)로.
 * 연도가 2자리면 2000년대로 본다. 파싱 불가면 null.
 */
export function parseKoreanDate(raw: string): string | null {
  const m = raw.trim().match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) return null;
  let year = Number(m[1]);
  if (year < 100) year += 2000;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!month || !day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * CSV 셀의 숫자 파싱. 빈값/'-'/숫자 아님 → null. 천단위 콤마/통화/공백 제거.
 * (CSV는 콤마 구분이라 셀 내부 콤마는 이미 분리돼 들어오지 않지만, 방어적으로 제거.)
 */
export function parseNum(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.replace(/[",\s원]/g, '').trim();
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// cp949(euc-kr) ArrayBuffer → 문자열.
function decodeCp949(buf: ArrayBuffer): string {
  return new TextDecoder('euc-kr').decode(new Uint8Array(buf));
}

/**
 * 따옴표를 고려한 1행 CSV 파싱(셀 내부 콤마/따옴표 처리). Opinet CSV는 단순하지만
 * 라벨에 콤마가 섞일 수 있어 방어적으로 처리한다.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** CSV 텍스트 → { header, rows }. 빈 줄 제거. */
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { header, rows };
}

/**
 * 헤더 라벨로 컬럼 인덱스를 찾는다(부분 일치, 첫 매칭). 코드/라벨 불일치 대비라 라벨
 * 후보 여러 개를 받아 먼저 매칭되는 걸 쓴다. 못 찾으면 -1.
 */
function findCol(header: string[], ...labels: string[]): number {
  for (const label of labels) {
    const idx = header.findIndex((h) => h.includes(label));
    if (idx >= 0) return idx;
  }
  return -1;
}

// 세션 쿠키를 워밍한 뒤 _csv.do 를 POST 해 cp949 CSV 텍스트를 받는다.
// 1) GET warmUrl → Set-Cookie 수집 2) POST csvUrl(application/x-www-form-urlencoded) + 쿠키.
async function fetchOpinetCsv(warmUrl: string, csvUrl: string, body: string): Promise<string> {
  const warm = await fetch(warmUrl, {
    headers: { 'User-Agent': BROWSER_UA },
    cache: 'no-store',
  });
  // Set-Cookie 들에서 name=value 만 추려 Cookie 헤더로 되돌려준다.
  const setCookie = warm.headers.get('set-cookie') ?? '';
  const cookie = setCookie
    .split(/,(?=[^;]+?=)/) // 여러 Set-Cookie 가 콤마로 합쳐진 경우 분리
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');

  const res = await fetch(csvUrl, {
    method: 'POST',
    headers: {
      'User-Agent': BROWSER_UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: warmUrl,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`opinet csv ${res.status} (${csvUrl})`);
  return decodeCp949(await res.arrayBuffer());
}

// 날짜파트(STA_Y/M/D, END_Y/M/D)를 채운다(일부 엔드포인트가 STDDATE 외에 이걸 요구).
function dateParts(from: string, to: string): string {
  const fy = from.slice(0, 4), fm = from.slice(4, 6), fd = from.slice(6, 8);
  const ty = to.slice(0, 4), tm = to.slice(4, 6), td = to.slice(6, 8);
  return `STA_Y=${fy}&STA_M=${fm}&STA_D=${fd}&END_Y=${ty}&END_M=${tm}&END_D=${td}`;
}

// ─── 1) 국제 원유(Dubai/Brent/WTI) ───
export interface CrudeRow { date: string; dubai: number | null; brent: number | null; wti: number | null }

/** glopcoil_csv.do — 헤더: 기간,Dubai,Brent,WTI. 유종코드 Dubai=001/Brent=002/WTI=003. */
export async function fetchCrudeDaily(from: string, to: string): Promise<CrudeRow[]> {
  const body =
    `TERM=D&OILSRTCD1=001&OILSRTCD2=002&OILSRTCD3=003` +
    `&STDDATE=${from}&ENDDATE=${to}&${dateParts(from, to)}`;
  const text = await fetchOpinetCsv(
    `${OPINET_WEB}/gloptotSelect.do`,
    `${OPINET_WEB}/glopcoil_csv.do`,
    body,
  );
  const { header, rows } = parseCsv(text);
  if (rows.length === 0) return [];
  const cDate = findCol(header, '기간', '일자', '날짜');
  const cDubai = findCol(header, 'Dubai', '두바이');
  const cBrent = findCol(header, 'Brent', '브렌트');
  const cWti = findCol(header, 'WTI');
  const out: CrudeRow[] = [];
  for (const r of rows) {
    const date = cDate >= 0 ? parseKoreanDate(r[cDate] ?? '') : null;
    if (!date) continue;
    out.push({
      date,
      dubai: cDubai >= 0 ? parseNum(r[cDubai]) : null,
      brent: cBrent >= 0 ? parseNum(r[cBrent]) : null,
      wti: cWti >= 0 ? parseNum(r[cWti]) : null,
    });
  }
  return out;
}

// ─── 2) 국제 석유제품(MOPS 프록시: 싱가포르 현물 휘발유/경유) ───
export interface ProductRow { date: string; gasoline: number | null; diesel: number | null }

/**
 * glopopd_csv.do — ⚠️ 이 엔드포인트는 OILSRTCD 슬롯에 채운 코드대로 CSV 컬럼이 결정되며,
 * 슬롯을 일부만 채우면 코드가 무시·축약되는 등 불안정하다(실측). 따라서 전 유종 7코드를
 * 모두 채워 안정적으로 전 컬럼을 받은 뒤, 헤더 라벨로 우리가 쓸 컬럼(92RON / 경유)을 고른다.
 *
 * 유종 코드(웹 폼 기준): B001=95RON, B007=92RON, C001=등유, D009=경유0.001%,
 *   D008=경유0.05%, E001=중유, F001=나프타.
 * 우리가 쓸 건 휘발유(92RON)와 경유(0.05% 우선, 없으면 0.001%).
 * 헤더 예: 기간,휘발유(95RON),휘발유(92RON),등유,경유(0.001%),경유(0.05%),고유황중유...,나프타.
 */
export async function fetchMopsDaily(from: string, to: string): Promise<ProductRow[]> {
  const body =
    `TERM=D&OILSRTCD1=B001&OILSRTCD2=B007&OILSRTCD3=C001&OILSRTCD4=D009` +
    `&OILSRTCD5=D008&OILSRTCD6=E001&OILSRTCD7=F001` +
    `&STDDATE=${from}&ENDDATE=${to}&${dateParts(from, to)}`;
  const text = await fetchOpinetCsv(
    `${OPINET_WEB}/glopopdSelect.do`,
    `${OPINET_WEB}/glopopd_csv.do`,
    body,
  );
  const { header, rows } = parseCsv(text);
  if (rows.length === 0) return [];
  const cDate = findCol(header, '기간', '일자', '날짜');
  // 휘발유는 92RON 우선, 없으면 95RON/일반 '휘발유'로 폴백.
  const cGas = findCol(header, '92RON') >= 0
    ? findCol(header, '92RON')
    : findCol(header, '휘발유', 'Gasoline');
  // 경유는 0.05% 우선(국내 차량용 표준에 가까움), 없으면 0.001%, 일반 '경유'로 폴백.
  const cDiesel = findCol(header, '경유(0.05', '경유(0.001', '경유', 'Diesel', 'Gasoil');
  const out: ProductRow[] = [];
  for (const r of rows) {
    const date = cDate >= 0 ? parseKoreanDate(r[cDate] ?? '') : null;
    if (!date) continue;
    out.push({
      date,
      gasoline: cGas >= 0 ? parseNum(r[cGas]) : null,
      diesel: cDiesel >= 0 ? parseNum(r[cDiesel]) : null,
    });
  }
  return out;
}

// ─── 3) 국내 전국평균 소매가(일별, 원/L) ───
export interface DomesticRow { date: string; gasoline: number | null; diesel: number | null }

/**
 * dopOsPdrgCsv.do — 헤더: 구분,보통휘발유,자동차용경유. (TERM=D, B027/D047 플래그)
 * 보통휘발유→B027, 자동차용경유→D047 로 매핑해 적재한다.
 */
export async function fetchDomesticDaily(from: string, to: string): Promise<DomesticRow[]> {
  const body =
    `TERM=D&OIL_CD_B027=Y&OIL_CD_D047=Y` +
    `&sta_dt=${from}&end_dt=${to}&${dateParts(from, to)}` +
    `&chk_cnt=2&all_chk_cnt=5`;
  const text = await fetchOpinetCsv(
    `${OPINET_WEB}/user/dopospdrg/dopOsPdrgSelect.do`,
    `${OPINET_WEB}/user/dopospdrg/dopOsPdrgCsv.do`,
    body,
  );
  const { header, rows } = parseCsv(text);
  if (rows.length === 0) return [];
  const cDate = findCol(header, '구분', '기간', '일자', '날짜');
  const cGas = findCol(header, '보통휘발유', '휘발유');
  const cDiesel = findCol(header, '자동차용경유', '경유');
  const out: DomesticRow[] = [];
  for (const r of rows) {
    const date = cDate >= 0 ? parseKoreanDate(r[cDate] ?? '') : null;
    if (!date) continue;
    out.push({
      date,
      gasoline: cGas >= 0 ? parseNum(r[cGas]) : null,
      diesel: cDiesel >= 0 ? parseNum(r[cDiesel]) : null,
    });
  }
  return out;
}

// ─── 4) USD/KRW(일별) — Yahoo Finance ───
export interface FxRow { date: string; usdkrw: number | null }

/**
 * Yahoo chart API(KRW=X). FRED는 우리 실행환경에서 차단되므로 쓰지 않는다.
 * range 는 일수에 맞춰 1mo/3mo/6mo/1y/2y 중 충분한 구간을 고른다.
 */
export async function fetchUsdKrwDaily(days: number): Promise<FxRow[]> {
  const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : days <= 365 ? '1y' : '2y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA }, cache: 'no-store' });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
  const out: FxRow[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    if (!ts) continue;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const close = closes[i];
    out.push({ date, usdkrw: typeof close === 'number' && Number.isFinite(close) ? close : null });
  }
  return out;
}
