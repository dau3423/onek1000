// 자동차 정비소 sync 본체 — 서울 Cloud Run 전용.
//
// 앱의 app/api/internal/sync-repair/route.ts + lib/repair/{client,normalize,brand}.ts +
// lib/regions/addressMatch.ts 를 self-contained 로 포팅했다(@/ alias 미사용 — highway-sync 와 동일 원칙).
//
// ⚠️ 로직을 바꿀 때는 앱 쪽 원본도 함께 고쳐야 한다. 두 벌이 갈라지면 어느 쪽이 맞는지 알 수 없게 된다.
//    앱 라우트는 로컬(한국 IP)에서 수동 실행할 때 여전히 쓰인다.

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { SIGUNGU } from './sigungu-data.js';

const BASE = 'https://api.data.go.kr/openapi/tn_pubr_public_auto_maintenance_company_api';
const PAGE_SIZE = 1000;
const MAX_PAGES = 80;
const PAGE_TIMEOUT_MS = 30_000;
const UPSERT_CHUNK = 1000;
const MIN_EXPECTED_ROWS = 10_000;
/** 정리 안전판 — 삭제 대상이 이번 수집분의 이 비율을 넘으면 지우지 않는다. */
const CLEANUP_MAX_RATIO = 0.2;

const KR = { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 };

// ─────────────────────────────── 주소 → 시군구 ───────────────────────────────
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
const BY_SIDO = new Map();
for (const sg of SIGUNGU) {
  const l = BY_SIDO.get(sg.sido) ?? [];
  l.push(sg);
  BY_SIDO.set(sg.sido, l);
}
for (const l of BY_SIDO.values()) l.sort((a, b) => b.name.length - a.name.length);

function sigunguCodeFromAddress(addr) {
  const s = (addr ?? '').trim();
  if (!s) return null;
  // 시도 표기는 주소 맨 앞에 온다. 앞 12자만 봐서 본문 중간 지명에 낚이지 않게 한다.
  const head = s.slice(0, 12);
  let sido = null;
  for (const { alias, code } of SIDO_LOOKUP) { if (head.startsWith(alias)) { sido = code; break; } }
  if (!sido) return null;
  const candidates = BY_SIDO.get(sido);
  if (!candidates) return null;
  const rest = s.slice(0, 40);
  for (const sg of candidates) if (rest.includes(sg.name)) return sg.code;
  return null;
}

// ─────────────────────────────── 브랜드 판별 ───────────────────────────────
function canon(name) {
  return name
    .replace(/\(주\)|\(株\)|㈜|주식회사|유한회사|\(유\)|합자회사/g, '')
    .replace(/[\s()［］\[\]·・.,'"`-]/g, '')
    .toLowerCase();
}
const BRAND_RULES = [
  { brand: 'autoq', keywords: ['기아오토큐', '오토큐'] },
  { brand: 'bluehands', keywords: ['블루핸즈'] },
  { brand: 'chevrolet', keywords: ['쉐보레', 'chevrolet', 'gm대우', '대우자동차바로정비'] },
  { brand: 'renault', keywords: ['르노코리아', '르노삼성', '르노자동차'] },
  { brand: 'kgm', keywords: ['kg모빌리티', '쌍용자동차', '쌍용서비스', '쌍용모터스'] },
  { brand: 'imported', keywords: ['bmw', '비엠떠블유', '벤츠', 'benz', '아우디', 'audi', '폭스바겐', 'volkswagen', '테슬라', 'tesla', '토요타', 'toyota', '렉서스', 'lexus', '혼다', 'honda', '볼보', 'volvo', '포드', 'ford', '푸조', 'peugeot', '재규어', '랜드로버', '포르쉐', 'porsche'] },
  { brand: 'speedmate', keywords: ['스피드메이트', 'speedmate'] },
  { brand: 'autooasis', keywords: ['오토오아시스'] },
  { brand: 'carpos', keywords: ['카포스'] },
  { brand: 'gongim', keywords: ['공임나라'] },
  { brand: 'tire', keywords: ['타이어', 'tire', '티스테이션', 'tstation', '넥센', '미쉐린', 'michelin', '브리지스톤', 'bridgestone', '던롭', 'dunlop', '피렐리', 'pirelli'] },
  // ── 자동차검사소 규칙은 **의도적으로 없다** ──
  // 예전에는 업체명에 '검사'가 들어갔는지로 판별했는데, 실측 3.4만 곳 중 121곳만 잡혔다.
  // '○○모터스' 같은 지정정비사업자는 간판에 '검사'가 없어 이름만으로는 판별이 불가능하다.
  // 지금은 검사소 표준데이터(inspection.js → inspection_stations)를 직접 적재하고
  // 지도 RPC 가 brand='inspection' 으로 합쳐 내보낸다.
  // 여기서 다시 추론하면 **같은 업체가 두 번 그려진다** — 웹앱의 lib/repair/brand.ts 와 짝을 이룬다.
];
function detectBrand(name) {
  if (!name) return null;
  const c = canon(name);
  if (!c) return null;
  for (const { brand, keywords } of BRAND_RULES) if (keywords.some((k) => c.includes(k))) return brand;
  return null;
}

// ─────────────────────────────── 정규화 ───────────────────────────────
function normalizeCode(v) {
  const s = (v ?? '').trim();
  if (!s) return '';
  const stripped = s.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : '0';
}
function nullify(v) {
  const s = (v ?? '').trim();
  if (s.length === 0 || s.toLowerCase() === 'null') return null;
  return s;
}
function toShopType(raw) {
  switch (normalizeCode(raw)) {
    case '1': return 'general';
    case '2': return 'small';
    case '3': return 'specialty';
    case '4': return 'engine';
    default: return 'unknown';
  }
}
function isOperating(item) {
  if (nullify(item.clsbizDate) !== null) return false;
  const code = normalizeCode(item.bsnSttus);
  if (code === '') return true;   // 상태 없는 행을 폐업 취급하면 멀쩡한 곳이 사라진다
  return code === '1';
}
function toDate(v) {
  const s = nullify(v);
  if (!s) return null;
  const d = s.replace(/\D/g, '');
  if (d.length !== 8) return null;
  const m = Number(d.slice(4, 6)), day = Number(d.slice(6, 8));
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
/** 고유 관리번호가 없어 (기관코드|업체명|주소) 해시를 PK 로 쓴다. 같은 입력이면 같은 키 → 멱등. */
function makeShopKey(item) {
  const parts = [
    nullify(item.insttCode) ?? nullify(item.instt_code) ?? '',
    nullify(item.inspofcNm) ?? '',
    nullify(item.rdnmadr) ?? nullify(item.lnmadr) ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

function normalizeItems(items, syncedAt) {
  const stats = { total: items.length, dropped: { notOperating: 0, noName: 0, badCoord: 0 } };
  const byKey = new Map();
  for (const item of items) {
    if (!isOperating(item)) { stats.dropped.notOperating++; continue; }
    const name = nullify(item.inspofcNm);
    if (!name) { stats.dropped.noName++; continue; }
    const lat = Number(nullify(item.latitude));
    const lng = Number(nullify(item.longitude));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < KR.latMin || lat > KR.latMax || lng < KR.lngMin || lng > KR.lngMax) {
      stats.dropped.badCoord++; continue;
    }
    const addr = nullify(item.rdnmadr) ?? nullify(item.lnmadr);
    byKey.set(makeShopKey(item), {
      shop_key: makeShopKey(item),
      name,
      shop_type: toShopType(item.inspofcType),
      brand: detectBrand(name),
      road_addr: nullify(item.rdnmadr),
      jibun_addr: nullify(item.lnmadr),
      tel: nullify(item.phoneNumber),
      open_time: nullify(item.operOpenHm),
      close_time: nullify(item.operCloseHm),
      biz_status: nullify(item.bsnSttus),
      area: nullify(item.ar),
      lat, lng,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      institution: nullify(item.institutionNm),
      data_base_date: toDate(item.referenceDate),
      sigungu_code: sigunguCodeFromAddress(addr),
      // ⚠️ 반드시 실어야 한다 — 빠지면 conflict-update 시 옛 값이 남고 뒤이은 정리가 전부 지운다.
      synced_at: syncedAt,
    });
  }
  return { rows: [...byKey.values()], stats };
}

// ─────────────────────────────── 수집 ───────────────────────────────
/** 이 API 는 실측 결과 response 래퍼가 없는 {header, body} 다. 두 형태를 모두 받는다. */
function extractItems(body) {
  if (!body || typeof body !== 'object') return [];
  const raw = body.items;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.item)) return raw.item;
    if (raw.item && typeof raw.item === 'object') return [raw.item];
  }
  return [];
}

async function fetchPage(pageNo, key) {
  const params = new URLSearchParams({ pageNo: String(pageNo), numOfRows: String(PAGE_SIZE), type: 'json' });
  // serviceKey 는 인코딩본일 수 있어 URLSearchParams 에 넣지 않고 직접 붙인다(이중 인코딩 방지).
  const url = `${BASE}?serviceKey=${key}&${params}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED') || text.includes('SERVICE_KEY_IS_NULL')) {
      throw new Error('인증키 오류: data.go.kr 활용신청 승인 여부 확인 필요');
    }
    if (text.trimStart().startsWith('<')) throw new Error(`JSON 아닌 응답: ${text.slice(0, 200)}`);
    const json = JSON.parse(text);
    const env = json.response ?? json;
    if (env.header?.resultCode && env.header.resultCode !== '00') {
      throw new Error(`API 오류 ${env.header.resultCode}: ${env.header.resultMsg ?? ''}`);
    }
    const body = env.body;
    const total = Number(body?.totalCount);
    return { items: extractItems(body), totalCount: Number.isFinite(total) ? total : 0 };
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────── 본체 ───────────────────────────────
export async function runRepairSync({ dryRun = false, maxPages = MAX_PAGES } = {}) {
  const key = process.env.DATA_GO_KR_API_KEY || process.env.EV_CHARGER_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { ok: false, error: 'DATA_GO_KR_API_KEY 미설정' };
  if (!supabaseUrl || !supabaseKey) return { ok: false, error: 'Supabase 환경변수 미설정' };

  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const startedAt = new Date().toISOString();
  const pageCap = Math.min(Math.max(1, maxPages), MAX_PAGES);

  let fetched = 0, upserted = 0, pages = 0, totalCount = 0;
  const dropped = { notOperating: 0, noName: 0, badCoord: 0 };
  let complete = false, failure = null;

  try {
    for (let page = 1; page <= pageCap; page++) {
      const { items, totalCount: tc } = await fetchPage(page, key);
      pages = page;
      if (tc > 0) totalCount = tc;
      if (items.length === 0) { complete = true; break; }
      fetched += items.length;

      const { rows, stats } = normalizeItems(items, startedAt);
      dropped.notOperating += stats.dropped.notOperating;
      dropped.noName += stats.dropped.noName;
      dropped.badCoord += stats.dropped.badCoord;

      if (!dryRun && rows.length > 0) {
        for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
          const chunk = rows.slice(i, i + UPSERT_CHUNK);
          const { error } = await sb.from('repair_shops').upsert(chunk, { onConflict: 'shop_key' });
          if (error) throw new Error(`upsert 실패(${i}~${i + chunk.length}): ${error.message}`);
        }
        upserted += rows.length;
      } else if (dryRun) {
        upserted += rows.length;
      }
      if (items.length < PAGE_SIZE) { complete = true; break; }
    }
    if (!complete && pages >= pageCap && pageCap === MAX_PAGES) {
      failure = `MAX_PAGES(${MAX_PAGES}) 도달 — 원천 행수가 예상보다 많다`;
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  // stale 정리 — 완주 + 충분한 행수 + 삭제 규모가 정상일 때만.
  let deleted = 0, cleanupSkipped = null;
  if (dryRun) cleanupSkipped = 'dryRun — 쓰기·정리 생략';
  else if (!complete || failure) cleanupSkipped = failure ?? '수집 미완주';
  else if (upserted < MIN_EXPECTED_ROWS) cleanupSkipped = `수집 행수(${upserted}) 기대치 미만`;
  else {
    const { count, error: cErr } = await sb
      .from('repair_shops').select('shop_key', { count: 'exact', head: true }).lt('synced_at', startedAt);
    if (cErr) cleanupSkipped = `정리 전 카운트 실패: ${cErr.message}`;
    else if ((count ?? 0) > upserted * CLEANUP_MAX_RATIO) {
      cleanupSkipped = `정리 중단 — 삭제 대상(${count})이 수집분의 ${CLEANUP_MAX_RATIO * 100}% 초과. synced_at 갱신 누락 의심.`;
    } else {
      const { data, error } = await sb
        .from('repair_shops').delete().lt('synced_at', startedAt).select('shop_key');
      if (error) cleanupSkipped = `정리 실패: ${error.message}`;
      else deleted = data?.length ?? 0;
    }
  }

  return { ok: failure === null, startedAt, pages, totalCount, fetched, upserted, dropped, deleted, cleanupSkipped, error: failure, dryRun };
}
