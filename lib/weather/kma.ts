// 기상청 단기예보(공공데이터포털) + 에어코리아 미세먼지 예보 클라이언트 — 서버 전용.
//
// 인증키는 env KMA_API_KEY / AIRKOREA_API_KEY 로만 읽는다(NEXT_PUBLIC_ 금지 — SEC-1 준용).
// sync-weather(1일 1회 배치)에서만 외부 API를 호출하고, 조회 API(/api/carwash-index)는
// 적재된 carwash_index 를 읽거나(키 있음) mock 을 반환한다(키 없음/USE_MOCK).
//
// v1 지역 범위: 시도 17개 "대표점" 고정(격자 변환을 런타임에 하지 않고 사전 계산 격자 상수 사용).
// lib/ev/client.ts 의 EV_ZCODES 상수 패턴과 동형. 시군구 정밀화는 Out.

import type { SidoCode } from '@/types/station';
import { SIDO_NAME } from '@/types/station';

// ─── 세차 지수 도메인 타입 ───
export type CarwashGrade = 'good' | 'fair' | 'bad';

/** 세차 지수 1일치(대상일 기준). */
export interface CarwashDay {
  date: string;              // YYYY-MM-DD (KST)
  score: number;            // 0~100
  grade: CarwashGrade;
  popMax: number | null;    // 당일 최대 강수확률(%)
  popNext: number | null;   // 익일 최대 강수확률(%) — 감점 근거 표기용
  dustGrade: string | null; // 미세먼지 예보 등급(좋음/보통/나쁨/매우나쁨), null=결측
}

/** /api/carwash-index 응답 계약(디자인 명세의 카드 표시 요구를 그대로 충족). */
export interface CarwashIndexResult {
  region: SidoCode;
  regionName: string;
  days: CarwashDay[];
  best: CarwashDay | null;
}

// ─── 시도 17개 대표점: 기상청 단기예보 격자(nx, ny) + 대표 좌표(lat, lng) ───
// nx/ny 는 기상청 격자(Lambert)로 사전 계산한 시도청 소재 대표 도시값(근사).
// lat/lng 는 lat/lng → 최근접 시도 판정(nearestSido)용 대표 좌표.
export const SIDO_GRID: Record<SidoCode, { nx: number; ny: number; lat: number; lng: number }> = {
  '01': { nx: 60, ny: 127, lat: 37.5665, lng: 126.9780 }, // 서울
  '02': { nx: 60, ny: 121, lat: 37.2636, lng: 127.0286 }, // 경기(수원)
  '03': { nx: 73, ny: 134, lat: 37.8813, lng: 127.7300 }, // 강원(춘천)
  '04': { nx: 69, ny: 106, lat: 36.6424, lng: 127.4890 }, // 충북(청주)
  '05': { nx: 55, ny: 94,  lat: 36.6009, lng: 126.6608 }, // 충남(홍성)
  '06': { nx: 63, ny: 89,  lat: 35.8242, lng: 127.1480 }, // 전북(전주)
  '07': { nx: 50, ny: 67,  lat: 34.8118, lng: 126.3922 }, // 전남(목포)
  '08': { nx: 91, ny: 106, lat: 36.5684, lng: 128.7294 }, // 경북(안동)
  '09': { nx: 91, ny: 77,  lat: 35.2280, lng: 128.6811 }, // 경남(창원)
  '10': { nx: 98, ny: 76,  lat: 35.1796, lng: 129.0756 }, // 부산
  '11': { nx: 52, ny: 38,  lat: 33.4996, lng: 126.5312 }, // 제주
  '14': { nx: 89, ny: 90,  lat: 35.8714, lng: 128.6014 }, // 대구
  '15': { nx: 55, ny: 124, lat: 37.4563, lng: 126.7052 }, // 인천
  '16': { nx: 58, ny: 74,  lat: 35.1595, lng: 126.8526 }, // 광주
  '17': { nx: 67, ny: 100, lat: 36.3504, lng: 127.3845 }, // 대전
  '18': { nx: 102, ny: 84, lat: 35.5384, lng: 129.3114 }, // 울산
  '19': { nx: 66, ny: 103, lat: 36.4800, lng: 127.2890 }, // 세종
};

/** 17개 시도 코드(적재/순회용). */
export const SIDO_CODES = Object.keys(SIDO_GRID) as SidoCode[];

/** lat/lng 에서 최근접 시도 대표점의 시도 코드를 반환(행정경계 판정 없이 근사). */
export function nearestSido(lat: number, lng: number): SidoCode {
  let best: SidoCode = '01';
  let bestD = Infinity;
  for (const code of SIDO_CODES) {
    const p = SIDO_GRID[code];
    // 간단한 유클리드(위경도) 근사 — 근접 대표점 선택엔 충분(거리 절대값 불필요).
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = code; }
  }
  return best;
}

// ─── 지수 산출 공식(v1 근사·참고용) ───
// score(d) = 100 − max(당일 최대 POP, 익일 최대 POP)  … 세차 다음 날 비를 감점
//   − (해당일 미세먼지 '나쁨' 이상이면 20)             … 등급 결측이면 감점 없음
// 등급: good(≥70) / fair(40~69) / bad(<40). 0 미만은 0으로 클램프.
const DUST_BAD_PENALTY = 20;
const GRADE_GOOD_MIN = 70;
const GRADE_FAIR_MIN = 40;

/** 미세먼지 등급이 '나쁨' 이상인지(감점 대상). */
export function isDustBad(grade: string | null | undefined): boolean {
  if (!grade) return false;
  return grade.includes('나쁨'); // '나쁨' | '매우나쁨'
}

/** score → grade */
export function gradeOf(score: number): CarwashGrade {
  if (score >= GRADE_GOOD_MIN) return 'good';
  if (score >= GRADE_FAIR_MIN) return 'fair';
  return 'bad';
}

/** POP(당일/익일) + 미세먼지 등급으로 세차 지수 1일치를 계산. */
export function computeDay(
  date: string,
  popMax: number | null,
  popNext: number | null,
  dustGrade: string | null,
): CarwashDay {
  const rainPenalty = Math.max(popMax ?? 0, popNext ?? 0);
  const dustPenalty = isDustBad(dustGrade) ? DUST_BAD_PENALTY : 0;
  const score = Math.max(0, Math.min(100, 100 - rainPenalty - dustPenalty));
  return { date, score, grade: gradeOf(score), popMax, popNext, dustGrade };
}

/** days 중 최고 점수 날(동점이면 앞선 날). 빈 배열이면 null. */
export function pickBest(days: CarwashDay[]): CarwashDay | null {
  let best: CarwashDay | null = null;
  for (const d of days) {
    if (!best || d.score > best.score) best = d;
  }
  return best;
}

// ─── KST 날짜 유틸 ───
/** KST(UTC+9) 기준 오늘 + offsetDays 의 'YYYY-MM-DD'. */
export function kstDateStr(offsetDays = 0, now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000 + offsetDays * 86400000);
  return kst.toISOString().slice(0, 10);
}

/** KST 기준 오늘~오늘+3(4일) 날짜 문자열 배열. */
export function windowDates(now: Date = new Date()): string[] {
  return [0, 1, 2, 3].map((d) => kstDateStr(d, now));
}

// ─── 기상청 단기예보(getVilageFcst) ───
const KMA_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
// 단기예보 발표시각(KST). 발표 후 ~10분 뒤 조회 가능.
const BASE_TIMES = [23, 20, 17, 14, 11, 8, 5, 2];

/** 현재(KST) 기준 가장 최근 유효 발표(base_date, base_time)를 계산. */
export function latestBase(now: Date = new Date()): { baseDate: string; baseTime: string } {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const mo = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const hh = kst.getUTCHours();
  const mm = kst.getUTCMinutes();
  const nowMin = hh * 60 + mm;
  // 발표 후 10분 버퍼를 두고, 이미 지난 가장 최근 base_time 선택.
  for (const bh of BASE_TIMES) {
    if (nowMin >= bh * 60 + 10) {
      const base = new Date(Date.UTC(y, mo, d));
      return { baseDate: fmtYmd(base), baseTime: `${String(bh).padStart(2, '0')}00` };
    }
  }
  // 02:10 이전이면 전날 2300 발표.
  const prev = new Date(Date.UTC(y, mo, d) - 86400000);
  return { baseDate: fmtYmd(prev), baseTime: '2300' };
}

function fmtYmd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

interface KmaFcstItem {
  category?: string;   // 'POP' = 강수확률
  fcstDate?: string;   // YYYYMMDD
  fcstTime?: string;   // HHMM
  fcstValue?: string;  // '30' 등
}

interface KmaResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: KmaFcstItem[] | KmaFcstItem } };
  };
}

/**
 * 단기예보 POP(강수확률)을 격자(nx, ny) 1곳에서 조회 → 대상일별 최대 POP(%) 맵 반환.
 * 실패/타임아웃/빈 응답이면 throw. 호출부(sync)에서 시도별로 try/catch 한다.
 */
export async function fetchPopByDate(opts: {
  nx: number;
  ny: number;
  timeoutMs?: number;
  now?: Date;
}): Promise<Map<string, number>> {
  const key = process.env.KMA_API_KEY;
  if (!key) throw new Error('KMA_API_KEY missing');

  const { baseDate, baseTime } = latestBase(opts.now);
  const params = new URLSearchParams({
    serviceKey: key,
    dataType: 'JSON',
    numOfRows: '1000',
    pageNo: '1',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(opts.nx),
    ny: String(opts.ny),
  });
  const url = `${KMA_BASE}/getVilageFcst?${params.toString()}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`KMA ${res.status}`);
    const data = (await res.json()) as KmaResponse;
    const code = data.response?.header?.resultCode;
    if (code && code !== '00') {
      throw new Error(`KMA result ${code}: ${data.response?.header?.resultMsg ?? ''}`);
    }
    const raw = data.response?.body?.items?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const popByDate = new Map<string, number>();
    for (const it of items) {
      if (it.category !== 'POP') continue;
      const date = it.fcstDate;
      const v = Number(it.fcstValue);
      if (!date || !Number.isFinite(v)) continue;
      const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
      const cur = popByDate.get(iso);
      if (cur == null || v > cur) popByDate.set(iso, v);
    }
    if (popByDate.size === 0) throw new Error('KMA empty POP');
    return popByDate;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 에어코리아 미세먼지 예보(getMinuDustFrcstDspth) — 선택 입력(결측 허용) ───
const AIRKOREA_BASE = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc';

interface AirKoreaItem {
  informCode?: string;   // 'PM10' | 'PM25'
  informData?: string;   // 예보 대상일 YYYY-MM-DD
  informGrade?: string;  // '서울 : 나쁨,경기 : 보통,...'
}
interface AirKoreaResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: AirKoreaItem[] | AirKoreaItem };
  };
}

/**
 * 미세먼지(PM10) 예보 등급을 (시도명 → (대상일 → 등급)) 형태로 조회.
 * 예보는 통상 당일~모레까지만 제공 → 그 밖의 날은 결측(null)로 남는다(공식이 결측 허용).
 * 키 미설정/실패/빈 응답이면 빈 맵(감점 없음). 이 실패가 지수 산출을 막지 않는다.
 */
export async function fetchDustGrades(opts?: { timeoutMs?: number; now?: Date }): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  const key = process.env.AIRKOREA_API_KEY;
  if (!key) return out;

  const searchDate = kstDateStr(0, opts?.now);
  const params = new URLSearchParams({
    serviceKey: key,
    returnType: 'json',
    numOfRows: '100',
    pageNo: '1',
    searchDate,
    informCode: 'PM10',
  });
  const url = `${AIRKOREA_BASE}/getMinuDustFrcstDspth?${params.toString()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 12_000);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return out;
    const data = (await res.json()) as AirKoreaResponse;
    const raw = data.response?.body?.items;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const it of items) {
      const date = it.informData;
      const grade = it.informGrade;
      if (!date || !grade) continue;
      // '서울 : 나쁨,경기 : 보통,...' 파싱 → 지역명별 등급.
      for (const part of grade.split(',')) {
        const [region, g] = part.split(':').map((s) => s.trim());
        if (!region || !g) continue;
        let byDate = out.get(region);
        if (!byDate) { byDate = new Map(); out.set(region, byDate); }
        byDate.set(date, g);
      }
    }
    return out;
  } catch {
    return out; // 실패는 결측으로 흡수(감점 없음)
  } finally {
    clearTimeout(timer);
  }
}

/** 시도 코드 → 에어코리아 예보 지역명(informGrade 키). 근사 매핑. */
function airkoreaRegionName(code: SidoCode): string {
  // 에어코리아 예보는 광역 권역명(영서/영동 등)을 쓰기도 하나, 대표적으로 시도명이 온다.
  const map: Partial<Record<SidoCode, string>> = {
    '03': '영서', // 강원은 영서/영동으로 나뉨 — 대표점(춘천)은 영서
  };
  return map[code] ?? SIDO_NAME[code];
}

/**
 * 시도 1곳의 세차 지수 4일치(오늘~D+3)를 산출.
 * POP 맵(fetchPopByDate)과 미세먼지 맵(fetchDustGrades, 결측 허용)을 결합한다.
 */
export function buildDaysForSido(
  code: SidoCode,
  popByDate: Map<string, number>,
  dustByRegion: Map<string, Map<string, string>>,
  now: Date = new Date(),
): CarwashDay[] {
  const dust = dustByRegion.get(airkoreaRegionName(code));
  const dates = windowDates(now);
  return dates.map((date) => {
    const popMax = popByDate.get(date) ?? null;
    const popNext = popByDate.get(kstDateStr(1, new Date(`${date}T00:00:00Z`))) ?? null;
    const dustGrade = dust?.get(date) ?? null;
    return computeDay(date, popMax, popNext, dustGrade);
  });
}

// ─── Mock 폴백(키 없음/USE_MOCK) ───
/**
 * 고정 mock 세차 지수 4일치 — 키 없이 로컬에서 홈 카드(FR-3)가 렌더되도록.
 * 마지막 날(D+3)이 '좋음'이 되도록 강수확률을 배치한다(디자인의 "좋은 날" 예시).
 */
export function mockCarwashDays(now: Date = new Date()): CarwashDay[] {
  const dates = windowDates(now);
  const pops = [40, 80, 20, 10]; // 오늘~D+3 강수확률(%)
  return dates.map((date, i) => {
    const popMax = pops[i];
    const popNext = i + 1 < pops.length ? pops[i + 1] : null;
    return computeDay(date, popMax, popNext, null);
  });
}

/** mock 세차 지수 응답(지역명은 최근접 시도 기준). */
export function mockCarwashIndex(region: SidoCode, now: Date = new Date()): CarwashIndexResult {
  const days = mockCarwashDays(now);
  return {
    region,
    regionName: SIDO_NAME[region],
    days,
    best: pickBest(days),
  };
}
