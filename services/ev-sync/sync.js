// 전기차 충전소 sync 본체 — 서울 Cloud Run 전용.
//
// 앱의 app/api/internal/sync-ev/route.ts + lib/ev/{client,row}.ts + lib/regions/addressMatch.ts 를
// self-contained 로 포팅했다(@/ alias 미사용 — highway-sync·repair-sync 와 동일 원칙).
//
// ⚠️ 로직을 바꿀 때는 앱 쪽 원본도 함께 고쳐야 한다. 두 벌이 갈라지면 어느 쪽이 맞는지 알 수 없게 된다.
//    앱 라우트는 로컬(한국 IP)에서 수동 실행할 때 여전히 쓰인다.
//
// 유지한 설계(원본 라우트의 핵심 — 규모 때문에 반드시 필요):
//  - zcode(시도)별 페이지네이션. zcode 없이 전국을 한 번에 부르면 504 가 난다(원본 주석 실측).
//  - 페이지 단위 즉시 upsert: 한 페이지 받을 때마다 바로 쓰기 → 중간에 죽어도 받은 만큼 남는다.
//  - 페이지 커서(ev_sync_state.next_page) 영속화: 다음 실행이 "멈춘 페이지부터" 이어받는다.
//  - cycle 완료(마지막 페이지까지 수신)한 zcode 에 한해서만 stale 정리. 부분 수신은 절대 금지.
//
// ⚠️ synced_at 은 upsert payload 에 반드시 실린다(toRow 가 넣는다).
//    repair 에서 이걸 빠뜨려 conflict-update 시 옛 값이 남았고, 뒤이은 stale 정리가 테이블을
//    통째로 비운 사고가 있었다. 그 위에 아래 CLEANUP_MAX_RATIO 안전판을 더 두었다.

import { createClient } from '@supabase/supabase-js';
import { SIGUNGU } from './sigungu-data.js';

const EV_BASE = 'https://apis.data.go.kr/B552584/EvCharger';

/**
 * 시도 zcode (data.go.kr EvCharger 기준, 2026-08-22 전수 스캔으로 확인).
 *
 * ⚠️ 2026 행정구역 개편 반영: 광주광역시(29) + 전라남도(46) 가 **전남광주통합특별시(12)** 로 통합됐다.
 *    29·46 은 이제 totalCount=0 을 준다(3/3 재현). 12 는 32,870건. 앱의 lib/ev/client.ts 도 같이 고쳤다.
 *    강원(42→51)·전북(45→52) 특별자치도 전환은 원본에 이미 반영돼 있었다.
 */
export const EV_ZCODES = [
  '11', '12', '26', '27', '28', '30', '31', '36',
  '41', '51', '43', '44', '52', '47', '48', '50',
];

/** 더 이상 원천이 서비스하지 않는 zcode — 남아 있는 옛 행을 한 번 걷어낸다(아래 purgeRetiredZcodes). */
const RETIRED_ZCODES = ['29', '46'];
/** 통합 후 이 코드가 29·46 을 대체한다. 이 zcode 가 건강하게 완주해야만 옛 행을 지운다. */
const SUCCESSOR_ZCODE = '12';
/** 승계 zcode 가 최소 이만큼은 받아야 "정상 통합"으로 보고 옛 행 삭제를 허용한다. */
const SUCCESSOR_MIN_ROWS = 10_000;

// 한 페이지 행 수. 실측(2026-08-22, 한국 IP): 1500행 페이지가 0.26초, 심층 페이지(50)도 0.31초.
// (원본 주석의 "페이지당 16~19초"는 더는 유효하지 않다 — 원천이 빨라졌다.)
// 병목은 API 가 아니라 Supabase upsert 이므로 페이지를 키워도 얻는 게 적다. 1500 유지.
const NUM_OF_ROWS = 1500;
// 시도당 페이지 상한(폭주 가드). 경기(41)가 154,904건 = 104페이지 → 300이면 45만건/시도까지 커버.
const MAX_PAGES = 300;
// 단일 upsert payload 상한. 1500행 한 번에 보내면 payload 가 크고 타임아웃 위험이 있어 1000으로 쪼갠다.
const UPSERT_CHUNK = 1000;
// 호출 사이 짧은 지연(throttle 회피).
const REQUEST_DELAY_MS = 50;
const PAGE_TIMEOUT_MS = 60_000;
const MAX_RETRY = 2;
// 기본 시간예산. Cloud Run --timeout 3600 기준으로 300초 여유를 남긴다.
const DEFAULT_BUDGET_MS = 3_300_000;
// data.go.kr 일일 한도 가드 — 한 호출이 부를 수 있는 총 API 호출 상한.
// 전국 1바퀴는 약 360페이지(526k / 1500 + 시도별 나머지)라 1000이면 한 번에 완주할 수 있다.
const MAX_API_CALLS = 1000;
/** 정리 안전판 — 삭제 대상이 그 시도 원천 총건수의 이 비율을 넘으면 지우지 않는다. */
const CLEANUP_MAX_RATIO = 0.2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────── 주소 → 시군구 ───────────────────────────────
// lib/regions/addressMatch.ts 포팅본. sigungu_code 가 없으면 SEO 지역 랜딩
// (/regions/{시도}/{시군구}/ev)의 데이터가 비므로 반드시 채운다.

const SIDO_ALIASES = {
  '01': ['서울특별시', '서울시', '서울'],
  '02': ['경기도', '경기'],
  '03': ['강원특별자치도', '강원도', '강원'],
  '04': ['충청북도', '충북'],
  '05': ['충청남도', '충남'],
  '06': ['전북특별자치도', '전라북도', '전북'],
  '07': ['전라남도', '전남'],
  '08': ['경상북도', '경북'],
  '09': ['경상남도', '경남'],
  '10': ['부산광역시', '부산시', '부산'],
  '11': ['제주특별자치도', '제주도', '제주'],
  '14': ['대구광역시', '대구시', '대구'],
  '15': ['인천광역시', '인천시', '인천'],
  '16': ['광주광역시', '광주시', '광주'],
  '17': ['대전광역시', '대전시', '대전'],
  '18': ['울산광역시', '울산시', '울산'],
  '19': ['세종특별자치시', '세종시', '세종'],
};
const SIDO_LOOKUP = Object.entries(SIDO_ALIASES)
  .flatMap(([code, aliases]) => aliases.map((alias) => ({ alias, code })))
  .sort((a, b) => b.alias.length - a.alias.length);

/**
 * 광주·전남 통합 표기. 한 표기 아래에 두 시도(광주 16 / 전남 07)의 시군구가 섞여 온다.
 * 두 목록에 이름 겹침이 없어(광주는 동/서/남/북/광산구, 전남은 전부 시·군) 순서대로 훑으면 안전하다.
 * 이게 없으면 "전남광주통합특별시 북구 …" 가 '전남' 으로만 잡혀 광주 시군구를 못 찾고 null 이 된다.
 */
const MERGED_SIDO_ALIASES = [{ alias: '전남광주통합특별시', codes: ['16', '07'] }];

const BY_SIDO = new Map();
for (const sg of SIGUNGU) {
  const l = BY_SIDO.get(sg.sido) ?? [];
  l.push(sg);
  BY_SIDO.set(sg.sido, l);
}
for (const l of BY_SIDO.values()) l.sort((a, b) => b.name.length - a.name.length);

/** 주소 첫머리 표기 → 후보 시도 코드 목록(보통 1개, 통합 표기만 2개). */
function sidoCandidatesFromAddress(addr) {
  const s = (addr ?? '').trim();
  if (!s) return [];
  // 시도 표기는 주소 맨 앞에 온다. 앞 12자만 봐서 본문 중간 지명에 낚이지 않게 한다.
  const head = s.slice(0, 12);
  for (const { alias, codes } of MERGED_SIDO_ALIASES) {
    if (head.startsWith(alias)) return codes;
  }
  for (const { alias, code } of SIDO_LOOKUP) {
    if (head.startsWith(alias)) return [code];
  }
  return [];
}

function sigunguCodeFromAddress(addr) {
  const s = (addr ?? '').trim();
  if (!s) return null;
  const rest = s.slice(0, 40);
  for (const sido of sidoCandidatesFromAddress(s)) {
    const candidates = BY_SIDO.get(sido);
    if (!candidates) continue;
    for (const sg of candidates) if (rest.includes(sg.name)) return sg.code;
  }
  return null;
}

// ─────────────────────────────── 값 정규화 ───────────────────────────────
// lib/ev/client.ts 의 evNorm / evYn / evDateToIso 포팅본.

/** "null"/""/공백을 모두 빈 값으로 정규화. data.go.kr JSON 은 빈 값을 "null" 문자열로 줄 때가 있다. */
function evNorm(v) {
  const t = String(v ?? '').trim();
  if (!t || t.toLowerCase() === 'null') return null;
  return t;
}

/** Y/N → boolean(null 허용) */
function evYn(v) {
  const t = evNorm(v);
  if (t == null) return null;
  return t.toUpperCase() === 'Y';
}

/** yyyyMMddHHmmss → ISO(KST 가정, 로컬 타임존 무관하게 +09:00 로 해석). 실패 시 null. */
function evDateToIso(v) {
  const t = evNorm(v);
  if (!t || t.length < 8) return null;
  const iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T`
    + `${t.slice(8, 10) || '00'}:${t.slice(10, 12) || '00'}:${t.slice(12, 14) || '00'}+09:00`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

// ─────────────────────────────── 행 매핑 ───────────────────────────────
// lib/ev/row.ts 의 toRow 포팅본. 컬럼 하나라도 어긋나면 조용히 갈라지니 순서까지 맞춰 뒀다.

/** getChargerInfo item → ev_chargers 행. 좌표/필수값 누락이면 null(skip). */
function toRow(it, now) {
  const statId = evNorm(it.statId);
  const chgerId = evNorm(it.chgerId);
  if (!statId || !chgerId) return null;

  const lat = Number(evNorm(it.lat));
  const lng = Number(evNorm(it.lng));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;

  const outRaw = evNorm(it.output);
  const outNum = outRaw != null ? Number(outRaw) : NaN;

  return {
    stat_id: statId,
    chger_id: chgerId,
    stat_nm: evNorm(it.statNm) ?? statId,
    addr: evNorm(it.addr),
    addr_detail: evNorm(it.addrDetail),
    sigungu_code: sigunguCodeFromAddress(evNorm(it.addr)),
    lat,
    lng,
    geom: `SRID=4326;POINT(${lng} ${lat})`,
    chger_type: evNorm(it.chgerType),
    output_kw: Number.isFinite(outNum) ? Math.round(outNum) : null,
    use_time: evNorm(it.useTime),
    method: evNorm(it.method),
    busi_id: evNorm(it.busiId),
    busi_nm: evNorm(it.busiNm),
    busi_call: evNorm(it.busiCall),
    stat: evNorm(it.stat),
    stat_upd_dt: evDateToIso(it.statUpdDt),
    kind: evNorm(it.kind),
    kind_detail: evNorm(it.kindDetail),
    zcode: evNorm(it.zcode),
    zscode: evNorm(it.zscode),
    parking_free: evYn(it.parkingFree),
    limit_yn: evYn(it.limitYn),
    del_yn: evYn(it.delYn) ?? false,
    output_raw: outRaw,
    // ⚠️ 반드시 실어야 한다 — 빠지면 conflict-update 시 옛 값이 남고 뒤이은 정리가 전부 지운다.
    synced_at: now,
  };
}

// ─────────────────────────────── 수집 ───────────────────────────────
// EvCharger(dataType=JSON) 응답은 표준 래퍼(response.header/body)가 없는 "최상위 플랫" 구조다.
//   { items:{item:[...]}, resultCode:"00", resultMsg:"NORMAL SERVICE.", totalCount, pageNo, numOfRows }
// 만일을 대비해 래퍼 형태도 폴백으로 받는다.

function bodyOf(data) {
  if (data?.items != null || data?.totalCount != null || data?.resultMsg != null) return data;
  return data?.response?.body ?? data;
}

function itemsOf(data) {
  const body = bodyOf(data);
  const raw = Array.isArray(body.items) ? body.items : body.items?.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw]; // 단건이면 객체로 온다
}

async function fetchPage({ zcode, pageNo, key }) {
  const params = new URLSearchParams({
    serviceKey: key,          // hex 키(특수문자 없음) — 그대로 전달
    pageNo: String(pageNo),
    numOfRows: String(NUM_OF_ROWS),
    zcode,
    dataType: 'JSON',
  });
  const url = `${EV_BASE}/getChargerInfo?${params.toString()}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`EvCharger ${res.status}`);
    const data = await res.json();
    const body = bodyOf(data);
    const code = body.resultCode ?? data?.response?.header?.resultCode;
    const msg = body.resultMsg ?? data?.response?.header?.resultMsg ?? '';
    if (code && code !== '00') throw new Error(`EvCharger result ${code}: ${msg}`);
    // resultCode 가 없더라도 명백한 에러 메시지(키 오류/한도 등)는 방어적으로 throw.
    if (!code && msg && /SERVICE[_ ]?KEY|LIMITED|ERROR|DENIED|UNREGISTERED|EXPIRED/i.test(msg)) {
      throw new Error(`EvCharger error: ${msg}`);
    }
    const total = Number(body.totalCount ?? 0);
    return { items: itemsOf(data), totalCount: Number.isFinite(total) ? total : 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** 타임아웃/일시 오류 재시도 래퍼. */
async function fetchPageWithRetry(args) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      return await fetchPage(args);
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('ev fetch failed');
}

// ─────────────────────────── 커서(ev_sync_state) ───────────────────────────
// 테이블이 없으면 조용히 폴백(page1부터). 마이그레이션 0016 적용을 권장한다.

async function loadCursors(sb) {
  try {
    const { data, error } = await sb
      .from('ev_sync_state')
      .select('zcode, next_page, total_count, cycle_started_at');
    if (error) return null;
    const m = new Map();
    for (const r of data ?? []) m.set(r.zcode, r);
    return m;
  } catch {
    return null;
  }
}

async function saveCursor(sb, enabled, row) {
  if (!enabled) return;
  const payload = { zcode: row.zcode, next_page: row.next_page, updated_at: new Date().toISOString() };
  if (row.total_count !== undefined) payload.total_count = row.total_count;
  if (row.cycle_started_at !== undefined) payload.cycle_started_at = row.cycle_started_at;
  try {
    await sb.from('ev_sync_state').upsert(payload, { onConflict: 'zcode' });
  } catch {
    // 커서 저장 실패는 적재 자체를 막지 않는다(다음 호출이 page1부터일 뿐).
  }
}

// ─────────────────────────────── 시도 1개 ───────────────────────────────

async function upsertInChunks(sb, rows, label) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from('ev_chargers').upsert(chunk, { onConflict: 'stat_id,chger_id' });
    if (error) throw new Error(`${label} 실패(rows ${i}~${i + chunk.length}): ${error.message}`);
  }
}

/**
 * 한 시도(zcode)를 커서(next_page)부터 페이지 단위로 즉시 upsert.
 * 매 페이지 upsert 직후 next_page 를 저장해, 중단돼도 다음 호출이 이어받는다.
 */
async function syncZone(sb, zcode, ctx) {
  const { now, key, dryRun, cursorsEnabled, cursor, budget, pageCap } = ctx;
  let upserts = 0;
  let skipped = 0;
  let apiCalls = 0;
  // sigungu_code 매칭 실패 수 — 원천 주소 표기가 바뀌면(행정구역 개편) 조용히 치솟는다.
  // SEO 지역 랜딩이 비는 걸 사후에 알아채지 못하는 게 이 파이프라인의 약점이라 계측한다.
  let noSigungu = 0;

  const rawStart = cursor?.next_page ?? 1;
  const startPage = Number.isFinite(rawStart) && rawStart >= 1 ? rawStart : 1;
  // 이번 cycle 의 synced_at 하한: 진행 중이면 그 시작 시각 유지, 새 cycle 이면 now.
  const cycleStartedAt = startPage > 1 && cursor?.cycle_started_at ? cursor.cycle_started_at : now;

  let total = cursor?.total_count ?? 0;
  let lastPage = startPage - 1;

  for (let pageNo = startPage; pageNo <= pageCap; pageNo++) {
    if (pageNo > startPage) {
      const elapsed = Date.now() - budget.startedAtMs;
      if (elapsed > budget.budgetMs || budget.apiCalls + apiCalls >= MAX_API_CALLS) {
        return { upserts, skipped, noSigungu, apiCalls, complete: false, startPage, lastPage, totalCount: total, cycleStartedAt };
      }
      await sleep(REQUEST_DELAY_MS);
    }

    const page = await fetchPageWithRetry({ zcode, pageNo, key });
    apiCalls++;
    if (page.totalCount > 0) total = page.totalCount;

    const rows = [];
    for (const it of page.items) {
      const r = toRow(it, now);
      if (!r) { skipped++; continue; }
      if (r.sigungu_code === null) noSigungu++;
      rows.push(r);
    }
    // 같은 페이지 안에 (stat_id, chger_id) 중복이 오면 upsert 가 "ON CONFLICT DO UPDATE command
    // cannot affect row a second time" 로 통째로 실패한다. 페이지 내 중복은 뒤엣것을 살린다.
    const byKey = new Map();
    for (const r of rows) byKey.set(`${r.stat_id}|${r.chger_id}`, r);
    const deduped = [...byKey.values()];

    if (!dryRun && deduped.length > 0) {
      await upsertInChunks(sb, deduped, `ev upsert z${zcode} p${pageNo}`);
    }
    upserts += deduped.length;
    lastPage = pageNo;

    // 마지막 페이지 판정은 **원천 totalCount 로만** 한다.
    // pageCap(=?maxPages 스모크값)으로 잘라 판정하면 부분 수신을 "완주"로 오인해
    // stale 정리가 멀쩡한 행을 지운다 — 절대 섞지 말 것.
    const pages = Math.max(1, Math.ceil(total / NUM_OF_ROWS) || 1);
    const isLastPage = pageNo >= pages;

    if (!dryRun) {
      await saveCursor(sb, cursorsEnabled, {
        zcode,
        next_page: isLastPage ? pages + 1 : pageNo + 1,
        total_count: total,
        cycle_started_at: cycleStartedAt,
      });
    }

    if (isLastPage) {
      return { upserts, skipped, noSigungu, apiCalls, complete: true, startPage, lastPage, totalCount: total, cycleStartedAt };
    }
  }

  // pageCap 도달 — 폭주 가드. 완주로 보지 않는다(부분 수신이면 stale 정리 금지).
  return { upserts, skipped, noSigungu, apiCalls, complete: false, startPage, lastPage, totalCount: total, cycleStartedAt };
}

/**
 * 완주한 zcode 의 stale 정리.
 * 안전판: 원천 총건수(totalCount)의 CLEANUP_MAX_RATIO 를 넘게 지워야 하면 중단한다.
 * 분모를 "이번 호출 upsert 수"가 아니라 totalCount 로 잡는 이유 — cycle 이 여러 호출에 걸치면
 * 마지막 호출의 upsert 수는 시도 전체의 일부라, 그걸 분모로 쓰면 정상 정리까지 막힌다.
 */
async function cleanupZone(sb, zcode, cycleStartedAt, totalCount) {
  if (totalCount <= 0) return { deleted: 0, skipped: `원천 totalCount=0 — 정리 보류(일시 장애와 구분 불가)` };

  const { count, error: cErr } = await sb
    .from('ev_chargers')
    .select('stat_id', { count: 'exact', head: true })
    .eq('zcode', zcode)
    .lt('synced_at', cycleStartedAt);
  if (cErr) return { deleted: 0, skipped: `정리 전 카운트 실패: ${cErr.message}` };

  const n = count ?? 0;
  if (n === 0) return { deleted: 0, skipped: null };
  if (n > totalCount * CLEANUP_MAX_RATIO) {
    return {
      deleted: 0,
      skipped: `정리 중단 — 삭제 대상(${n})이 원천 총건수(${totalCount})의 ${CLEANUP_MAX_RATIO * 100}% 초과. synced_at 갱신 누락 의심.`,
    };
  }

  const { data, error } = await sb
    .from('ev_chargers')
    .delete()
    .eq('zcode', zcode)
    .lt('synced_at', cycleStartedAt)
    .select('stat_id');
  if (error) return { deleted: 0, skipped: `정리 실패: ${error.message}` };
  return { deleted: data?.length ?? 0, skipped: null };
}

/**
 * 폐지된 zcode(29 광주 / 46 전남) 잔존 행 제거.
 * 승계 zcode(12)가 이번 실행에서 SUCCESSOR_MIN_ROWS 이상 받아 완주했을 때만 지운다 —
 * 원천 일시 장애로 12가 비어 오는 상황에서 옛 데이터까지 날리지 않기 위한 안전판이다.
 */
async function purgeRetiredZcodes(sb) {
  const { data, error } = await sb
    .from('ev_chargers')
    .delete()
    .in('zcode', RETIRED_ZCODES)
    .select('stat_id');
  if (error) return { deleted: 0, error: `폐지 zcode 정리 실패: ${error.message}` };
  return { deleted: data?.length ?? 0, error: null };
}

/**
 * 처리 순서: 진행 중(next_page>1)인 zcode 우선(이어받기) → 그다음 cycle 이 오래된 zcode.
 * 커서가 없으면 EV_ZCODES 선언 순서 그대로.
 */
function orderZcodes(cursors) {
  if (!cursors) return [...EV_ZCODES];
  const inProgress = [];
  const fresh = [];
  for (const z of EV_ZCODES) {
    const c = cursors.get(z);
    if (c && c.next_page > 1) inProgress.push(z);
    else fresh.push({ z, ts: c?.cycle_started_at ? Date.parse(c.cycle_started_at) : 0 });
  }
  inProgress.sort();
  fresh.sort((a, b) => a.ts - b.ts || (a.z < b.z ? -1 : 1));
  return [...inProgress, ...fresh.map((f) => f.z)];
}

// ─────────────────────────────── 본체 ───────────────────────────────

export async function runEvSync({ dryRun = false, zcode = null, maxPages, budgetMs } = {}) {
  const key = process.env.EV_CHARGER_API_KEY || process.env.DATA_GO_KR_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { ok: false, error: 'EV_CHARGER_API_KEY 미설정' };
  if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Supabase 환경변수 미설정' };

  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  const startedAtMs = Date.now();
  const pageCap = Math.min(Math.max(1, maxPages ?? MAX_PAGES), MAX_PAGES);
  const budget = {
    startedAtMs,
    budgetMs: Math.min(Math.max(1000, budgetMs ?? DEFAULT_BUDGET_MS), DEFAULT_BUDGET_MS),
    apiCalls: 0,
  };

  const cursors = dryRun ? null : await loadCursors(sb);
  const cursorsEnabled = cursors !== null;

  const targets = zcode ? [zcode] : orderZcodes(cursors);

  let totalUpserts = 0;
  let totalSkipped = 0;
  let totalNoSigungu = 0;
  let staleDeleted = 0;
  let retiredDeleted = 0;
  const okZcodes = [];
  const errors = [];
  const progress = [];
  let resumeFrom = null;

  for (const z of targets) {
    const elapsed = Date.now() - startedAtMs;
    if (!zcode && (elapsed > budget.budgetMs || budget.apiCalls >= MAX_API_CALLS)) {
      resumeFrom = z;
      break;
    }

    try {
      const r = await syncZone(sb, z, {
        now, key, dryRun, cursorsEnabled,
        cursor: cursors?.get(z),
        budget, pageCap,
      });
      budget.apiCalls += r.apiCalls;
      totalUpserts += r.upserts;
      totalSkipped += r.skipped;
      totalNoSigungu += r.noSigungu;

      let cleanup = null;
      if (r.complete && !dryRun) {
        const c = await cleanupZone(sb, z, r.cycleStartedAt, r.totalCount);
        staleDeleted += c.deleted;
        cleanup = c.skipped;
        if (c.skipped) errors.push(`z${z} ${c.skipped}`);
        else okZcodes.push(z);

        // cycle 완료 → 다음 한 바퀴 준비: 커서 page1 리셋 + cycle_started_at 갱신.
        await saveCursor(sb, cursorsEnabled, {
          zcode: z, next_page: 1, total_count: r.totalCount, cycle_started_at: now,
        });

        // 광주·전남 통합 승계가 건강히 끝났으면 폐지 zcode 잔존 행을 걷어낸다.
        if (z === SUCCESSOR_ZCODE && r.totalCount >= SUCCESSOR_MIN_ROWS) {
          const p = await purgeRetiredZcodes(sb);
          retiredDeleted += p.deleted;
          if (p.error) errors.push(p.error);
        }
      } else if (r.complete && dryRun) {
        okZcodes.push(z);
      }

      progress.push({
        zcode: z,
        startPage: r.startPage,
        lastPage: r.lastPage,
        nextPage: r.complete ? 1 : r.lastPage + 1,
        totalCount: r.totalCount,
        upserts: r.upserts,
        noSigungu: r.noSigungu,
        complete: r.complete,
        ...(cleanup ? { cleanupSkipped: cleanup } : {}),
      });

      if (!r.complete) {
        // 예산/상한으로 중단 — 부분 수신. 다음 호출이 이 zcode 부터 이어받는다.
        resumeFrom = z;
        break;
      }
      await sleep(REQUEST_DELAY_MS);
    } catch (e) {
      // 이 시도는 실패 → stale 정리에서 제외(과삭제 가드). 사유만 기록하고 다음 시도로.
      errors.push(`z${z}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    ok: true,
    asOf: now,
    mode: zcode ? `single(z${zcode})` : 'nationwide',
    dryRun,
    cursorEnabled: cursorsEnabled,
    zcodes: targets.length,
    okZcodes,
    okZcodesCount: okZcodes.length,
    apiCalls: budget.apiCalls,
    totalUpserts,
    totalSkipped,
    totalNoSigungu,
    staleDeleted,
    retiredDeleted,
    resumeFrom,
    elapsedMs: Date.now() - startedAtMs,
    progress,
    errors: errors.length ? errors : undefined,
  };
}
