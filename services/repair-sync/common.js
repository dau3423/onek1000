// 서울 Cloud Run sync 공통 유틸 — data.go.kr 표준데이터 계열.
//
// sync.js(정비소) 가 먼저 있었고 렌터카·검사소가 뒤따르면서 같은 코드가 세 벌이 될 상황이라
// 공통부를 여기로 모았다. 규칙은 웹앱 쪽 lib/dataGoKr/* 와 동일하다(둘은 의도적으로 별개다 —
// 이 서비스는 자체 완결형이어야 Cloud Run 에 단독 배포된다).

import { createHash } from 'node:crypto';
import { SIGUNGU } from './sigungu-data.js';

export const PAGE_SIZE = 1000;
export const PAGE_TIMEOUT_MS = 30_000;
export const UPSERT_CHUNK = 1000;
/** 정리 안전판 — 삭제 대상이 이번 수집분의 이 비율을 넘으면 지우지 않는다. */
export const CLEANUP_MAX_RATIO = 0.2;

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

export function sigunguCodeFromAddress(addr) {
  const s = (addr ?? '').trim();
  if (!s) return null;
  // 시도 표기는 주소 맨 앞에 온다. 앞 12자만 봐서 본문 중간 지명에 낚이지 않게 한다.
  const head = s.slice(0, 12);
  let sido = null;
  for (const { alias, code } of SIDO_LOOKUP) {
    if (head.startsWith(alias)) { sido = code; break; }
  }
  if (!sido) return null;
  const rest = s.slice(0, 40);
  for (const sg of BY_SIDO.get(sido) ?? []) {
    if (rest.includes(sg.name)) return sg.code;
  }
  return null;
}

// ─────────────────────────────── 값 정규화 ───────────────────────────────
/** data.go.kr 은 빈 값을 ''·'null'·공백으로 준다 — 전부 null 로 접는다. */
export function nullify(v) {
  const s = (v ?? '').toString().trim();
  if (s.length === 0 || s.toLowerCase() === 'null') return null;
  return s;
}

/** 'YYYYMMDD' 또는 'YYYY-MM-DD' → 'YYYY-MM-DD'. 그 외는 null. */
export function toDate(v) {
  const s = nullify(v);
  if (!s) return null;
  const d = s.replace(/\D/g, '');
  if (d.length !== 8) return null;
  const m = Number(d.slice(4, 6)), day = Number(d.slice(6, 8));
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** 숫자 필드 → number | null. 쉼표·단위 혼입을 견딘다. */
export function toInt(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const s = nullify(v);
  if (!s) return null;
  const d = s.replace(/[^0-9-]/g, '');
  if (!d.length) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

/** 'Y'/'N'/'여' 등 → boolean | null. 판단 불가면 null(모른다는 뜻을 살린다). */
export function toBool(v) {
  const s = nullify(v);
  if (!s) return null;
  const u = s.toUpperCase();
  if (['Y', 'YES', '1', 'TRUE'].includes(u) || s === '여' || s === '가능') return true;
  if (['N', 'NO', '0', 'FALSE'].includes(u) || s === '부' || s === '불가') return false;
  return null;
}

export function isValidKrCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= KR.latMin && lat <= KR.latMax && lng >= KR.lngMin && lng <= KR.lngMax;
}

/** 결정적 합성키 — 같은 입력이면 같은 키(재실행 멱등). */
export function hashKey(parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

// ─────────────────────────────── API 호출 ───────────────────────────────
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

/**
 * 표준데이터 한 페이지 조회. 실패 시 throw — 호출부가 부분 실패로 처리해 스냅샷을 지킨다.
 * ⚠️ API 마다 활용신청이 따로 필요하다(키가 있어도 미신청이면 SERVICE_KEY_IS_NOT_REGISTERED).
 */
export async function fetchStandardPage(endpoint, pageNo, key) {
  const params = new URLSearchParams({ pageNo: String(pageNo), numOfRows: String(PAGE_SIZE), type: 'json' });
  const url = `https://api.data.go.kr/openapi/${endpoint}?serviceKey=${key}&${params}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: 'no-store' });
    const text = await res.text();
    // ⚠️ 인증키 판정을 res.ok 검사보다 **먼저** 한다 — 미신청 키는 403 으로도 오고 200 봉투로도
    //    온다. 순서를 바꾸면 실제 원인(활용신청 누락)이 'HTTP 403' 에 가려진다.
    if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED') || text.includes('SERVICE_KEY_IS_NULL')) {
      throw new Error(`인증키 오류: '${endpoint}' 활용신청 승인 여부 확인 필요(API 마다 별도 신청)`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (text.trimStart().startsWith('<')) throw new Error(`JSON 아님(XML 에러 추정): ${text.slice(0, 200)}`);
    const json = JSON.parse(text);
    // 봉투 형태가 API 마다 다르다 — {response:{header,body}} 와 {header,body} 둘 다 존재한다.
    const env = json.response ?? json;
    if (env.header?.resultCode && env.header.resultCode !== '00') {
      throw new Error(`API 오류 ${env.header.resultCode}: ${env.header.resultMsg ?? ''}`);
    }
    const body = env.body;
    const tc = Number(body?.totalCount);
    return { items: extractItems(body), totalCount: Number.isFinite(tc) ? tc : 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 수집 → upsert → (완주 시) stale 정리 공통 루프.
 * 실패 안전 규칙은 웹앱의 lib/dataGoKr/syncRunner.ts 와 동일하다:
 *   전체삭제 금지 / 완주 시에만 정리 / 삭제 비율 가드 / dryRun.
 */
export async function runSync(sb, {
  endpoint, table, conflictKey, normalize, key,
  maxPages, minExpectedRows, dryRun = false,
}) {
  const startedAt = new Date().toISOString();
  const pageCap = Math.min(Math.max(1, maxPages), maxPages);
  let fetched = 0, upserted = 0, pages = 0, totalCount = 0;
  const stats = {};
  let complete = false, failure = null;

  const bump = (o, prefix = '') => {
    for (const [k, v] of Object.entries(o)) {
      const q = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'number') stats[q] = (stats[q] ?? 0) + v;
      else if (v && typeof v === 'object') bump(v, q);
    }
  };

  try {
    for (let page = 1; page <= pageCap; page++) {
      const { items, totalCount: tc } = await fetchStandardPage(endpoint, page, key);
      pages = page;
      if (tc > 0) totalCount = tc;
      if (items.length === 0) { complete = true; break; }
      fetched += items.length;

      const { rows, stats: st } = normalize(items, startedAt);
      bump(st);

      if (!dryRun && rows.length > 0) {
        for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
          const chunk = rows.slice(i, i + UPSERT_CHUNK);
          const { error } = await sb.from(table).upsert(chunk, { onConflict: conflictKey });
          if (error) throw new Error(`upsert 실패(${i}~${i + chunk.length}): ${error.message}`);
        }
        upserted += rows.length;
      } else if (dryRun) {
        upserted += rows.length;
      }
      if (items.length < PAGE_SIZE) { complete = true; break; }
    }
    if (!complete && pages >= pageCap) failure = `MAX_PAGES(${maxPages}) 도달 — 원천 행수가 예상보다 많다`;
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  let deleted = 0, cleanupSkipped = null;
  if (dryRun) cleanupSkipped = 'dryRun — 쓰기·정리 생략';
  else if (!complete || failure) cleanupSkipped = failure ?? '수집 미완주';
  else if (upserted < minExpectedRows) cleanupSkipped = `수집 행수(${upserted}) 기대치(${minExpectedRows}) 미만`;
  else {
    const { count, error: cErr } = await sb
      .from(table).select(conflictKey, { count: 'exact', head: true }).lt('synced_at', startedAt);
    if (cErr) cleanupSkipped = `정리 전 카운트 실패: ${cErr.message}`;
    else if ((count ?? 0) > upserted * CLEANUP_MAX_RATIO) {
      cleanupSkipped = `정리 중단 — 삭제 대상(${count})이 수집분의 ${CLEANUP_MAX_RATIO * 100}% 초과. synced_at 갱신 누락 의심.`;
    } else {
      const { data, error } = await sb.from(table).delete().lt('synced_at', startedAt).select(conflictKey);
      if (error) cleanupSkipped = `정리 실패: ${error.message}`;
      else deleted = data?.length ?? 0;
    }
  }

  return { ok: failure === null, startedAt, pages, totalCount, fetched, upserted, stats, deleted, cleanupSkipped, error: failure, dryRun };
}

/** Supabase 클라이언트 + 키 확보 — 세 sync 가 공통으로 쓴다. */
export function resolveEnv() {
  const key = process.env.DATA_GO_KR_API_KEY || process.env.EV_CHARGER_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { error: 'DATA_GO_KR_API_KEY 미설정' };
  if (!supabaseUrl || !supabaseKey) return { error: 'Supabase 환경변수 미설정' };
  return { key, supabaseUrl, supabaseKey };
}
