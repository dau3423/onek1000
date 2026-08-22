// Cron (주 1회 권장) — 독립 세차장 정적정보 적재
// 원천: 행정안전부 「전국세차장표준데이터」 CSV(file.localdata.go.kr, 무인증·무료·이용허락 제한 없음).
//
// ⚠️ 원천 위험 (2026-08 확인): LOCALDATA 포털(www.localdata.go.kr)은 2026-04-16 종료됐고,
//    지금 쓰는 file.localdata.go.kr 은 **그 이후 남아 있는 파일 서버**다. 오늘도 정상 응답하지만
//    (실측 HTTP 200 / 3.6MB) 언제 사라져도 이상하지 않다. 그래서 실패 시 조용히 지나가지 않고
//    관리자에게 카톡 알림을 보낸다 — 이 sync 는 주 1회라, 알림이 없으면 몇 주째 낡은 데이터를
//    서빙하고 있어도 아무도 모른다.
//
//    후속 경로: 공공데이터포털 「행정안전부_세차장정보 조회서비스」(data.go.kr/data/15155084,
//    무료·자동승인·이용허락 제한 없음). 다만 그 API 는 좌표를 WGS84 가 아니라
//    **Bessel 중부원점TM(EPSG:5174)** 로 준다 — 옮기려면 좌표 변환(proj4, lib/map/katec.ts 참고)이
//    필요하고, 변환을 잘못하면 1.6만 개 마커가 조용히 엉뚱한 자리로 간다. 실제 응답으로 검증할 수
//    있을 때(활용신청 승인 + 키 발급) 옮길 것. 지금 CSV 가 동작하는 동안 눈감고 바꾸지 않는다.
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK / Supabase 미설정 시 skip.
//
// 설계 요지(sync-ev의 "실패 안전" 교훈 준수):
//  - CSV 1파일(약 3.6MB·1.6만행)을 받아 파싱 → 청크 upsert(onConflict: mgmt_no).
//  - 다운로드는 Referer 헤더 필수(없으면 403). cp949(euc-kr) 디코딩 후 파싱.
//  - 임포트 제외: ① 사업장업종명에 '주유'·'충전' 포함(부설=기존 has_carwash 중복) ② 좌표 미채움
//    ③ 한반도 bbox(위도 33~39N, 경도 124~132E) 밖(이상치 가드).
//  - 세차유형 정규화(세차유형 필드 + 사업장명 키워드) → self/hand/auto/unknown.
//  - 개인정보 최소화: '대표자명' 컬럼은 파싱/저장하지 않는다.
//  - 실패 안전: 다운로드/파싱 실패 시 기존 테이블(마지막 성공 스냅샷)을 그대로 유지하고 에러를 응답에
//    기록한다. truncate 후 재삽입(전체삭제)은 절대 하지 않는다.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { sendAdminKakaoMemo, isAdminMemoConfigured } from '@/lib/kakao/adminMemo';
import { sigunguCodeFromAddress } from '@/lib/regions/addressMatch';
import type { WashType } from '@/types/carwash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 안내 페이지 Referer(없으면 403, research §3.1·§6-2). 다운로드 URL은 env로 덮어쓸 수 있게 둔다.
// (빈 문자열 env는 override로 보지 않고 기본값 사용 — .env.example의 빈 키가 기본을 지우지 않게 `||` 사용.)
const CSV_URL = process.env.CARWASH_CSV_URL
  || 'https://file.localdata.go.kr/file/download/car_wash_info/info';
const CSV_REFERER = process.env.CARWASH_CSV_REFERER
  || 'https://file.localdata.go.kr/file/car_wash_info/info';

const DOWNLOAD_TIMEOUT_MS = 60_000;
const UPSERT_CHUNK = 1000;

// 한반도 bbox 가드(좌표 이상치 드랍).
const KR_LAT_MIN = 33;
const KR_LAT_MAX = 39;
const KR_LNG_MIN = 124;
const KR_LNG_MAX = 132;

interface CarwashDbRow {
  mgmt_no: string;
  name: string;
  wash_type: WashType;
  road_addr: string | null;
  jibun_addr: string | null;
  tel: string | null;
  weekday_open: string | null;
  weekday_close: string | null;
  holiday_open: string | null;
  holiday_close: string | null;
  fee_info: string | null;
  closed_day: string | null;
  lat: number;
  lng: number;
  geom: string;
  biz_type_raw: string | null;
  data_base_date: string | null;
  /** 주소에서 계산한 시군구 코드(SEO 지역 랜딩용). 매칭 실패 시 null — 정상이다. */
  sigungu_code: string | null;
  synced_at: string;
}

/** 빈문자/공백 → null 정규화. */
function norm(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * 세차유형 정규화 — '세차유형' 필드 + 사업장명 키워드 결합.
 * 우선순위: 셀프 → 손세차/디테일 → 자동/기계식/노터치 → unknown.
 * (원천 세차유형 62% 미기재라 대부분 unknown일 수 있음 — "유형 미확인"으로 정직 표기.)
 */
function normalizeWashType(typeRaw: string | null, name: string | null): WashType {
  const hay = `${typeRaw ?? ''} ${name ?? ''}`;
  if (hay.includes('셀프')) return 'self';
  if (hay.includes('손세차') || hay.includes('디테일')) return 'hand';
  if (hay.includes('자동') || hay.includes('기계식') || hay.includes('노터치')) return 'auto';
  return 'unknown';
}

/** 'YYYY-MM-DD' / 'YYYYMMDD' / 'YYYY.MM.DD' 등 → 'YYYY-MM-DD' 또는 null. */
function toDate(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const yn = Number(y);
  const mn = Number(m);
  const dn = Number(d);
  if (yn < 1900 || yn > 2100 || mn < 1 || mn > 12 || dn < 1 || dn > 31) return null;
  return `${y}-${m}-${d}`;
}

/**
 * 간이 CSV 파서 — 따옴표(") 인용/이스케이프("") 및 인용부 내부의 개행/쉼표를 처리한다.
 * 원천 CSV는 자유입력 필드(세차유형/요금)가 많아 방어적으로 파싱한다(research §6-6).
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // BOM 제거.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') { continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  // 마지막 필드/행 flush(파일 끝에 개행이 없을 수 있음).
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** 헤더 배열에서 키워드 술어로 컬럼 인덱스를 찾는다(컬럼 순서/명칭 변화에 견고). */
function findCol(header: string[], pred: (h: string) => boolean): number {
  return header.findIndex((h) => pred(h.trim()));
}

async function upsertInChunks(
  sb: ReturnType<typeof getSupabase>,
  rows: CarwashDbRow[],
): Promise<number> {
  let ok = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from('carwash_places').upsert(chunk, { onConflict: 'mgmt_no' });
    if (error) throw new Error(`carwash upsert failed (rows ${i}-${i + chunk.length}): ${error.message}`);
    ok += chunk.length;
  }
  return ok;
}

/**
 * 원천 장애를 관리자에게 알린다(best-effort).
 * 미설정이면 조용히 skip 하고, 어떤 실패도 sync 응답을 바꾸지 않는다.
 * "실패했는데 아무도 모르는 상태"만 막는 게 목적이다.
 */
async function alertSourceFailure(reason: string): Promise<void> {
  if (!isAdminMemoConfigured()) return;
  try {
    await sendAdminKakaoMemo({
      text: `[1000냥] 세차장 동기화 실패\n${reason}\n\nLOCALDATA 포털은 2026-04-16 종료됐고 지금은 잔존 파일서버를 쓰고 있습니다. 서버가 내려간 것이라면 data.go.kr 세차장 API(15155084)로 이전이 필요합니다.`,
      linkUrl: 'https://www.data.go.kr/data/15155084/openapi.do',
    });
  } catch {
    /* 알림 실패는 무시 — sync 결과에 영향 주지 않는다 */
  }
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  // CRON_SECRET 빈값 가드 — 미설정 시 무조건 거부(Authorization: Bearer undefined 우회 차단).
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (secret.length === 0 || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'mock mode or missing config' });
  }

  const startedAt = Date.now();
  const now = new Date().toISOString();

  // 1) CSV 다운로드(Referer 필수). 실패 시 기존 테이블 유지 + 에러 기록(전체삭제 없음).
  let csvText: string;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), DOWNLOAD_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(CSV_URL, {
        headers: { Referer: CSV_REFERER, 'User-Agent': 'onek-carwash-sync/1.0' },
        signal: ac.signal,
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      await alertSourceFailure(`CSV 다운로드 실패: HTTP ${res.status}`);
      return NextResponse.json(
        { ok: false, error: `download failed: HTTP ${res.status}`, note: 'existing table kept (no truncate)' },
        { status: 502 },
      );
    }
    const buf = await res.arrayBuffer();
    // 원천은 cp949 인코딩 — euc-kr 디코더가 cp949(통합 완성형)를 커버한다.
    csvText = new TextDecoder('euc-kr').decode(new Uint8Array(buf));
  } catch (e) {
    await alertSourceFailure(`CSV 다운로드 오류: ${(e as Error).message}`);
    return NextResponse.json(
      { ok: false, error: `download error: ${(e as Error).message}`, note: 'existing table kept (no truncate)' },
      { status: 502 },
    );
  }

  // 2) 파싱 + 컬럼 매핑.
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    await alertSourceFailure('CSV 파싱 실패: 데이터 행 없음 (원천 형식 변경 의심)');
    return NextResponse.json(
      { ok: false, error: 'parse failed: no data rows', note: 'existing table kept (no truncate)' },
      { status: 502 },
    );
  }
  const header = rows[0];
  const col = {
    mgmtNo: findCol(header, (h) => h.includes('관리번호')),
    name: findCol(header, (h) => h.includes('사업장명')),
    bizType: findCol(header, (h) => h.includes('업종')),
    washType: findCol(header, (h) => h.includes('세차유형')),
    roadAddr: findCol(header, (h) => h.includes('도로명')),
    jibunAddr: findCol(header, (h) => h.includes('지번')),
    closedDay: findCol(header, (h) => h.includes('휴무')),
    weekdayOpen: findCol(header, (h) => h.includes('평일') && h.includes('시작')),
    weekdayClose: findCol(header, (h) => h.includes('평일') && h.includes('종료')),
    holidayOpen: findCol(header, (h) => h.includes('휴일') && h.includes('시작')),
    holidayClose: findCol(header, (h) => h.includes('휴일') && h.includes('종료')),
    feeInfo: findCol(header, (h) => h.includes('요금')),
    tel: findCol(header, (h) => h.includes('전화')),
    lat: findCol(header, (h) => h.includes('위도')),
    lng: findCol(header, (h) => h.includes('경도')),
    baseDate: findCol(header, (h) => h.includes('기준일')),
  };
  // 필수 컬럼(관리번호/사업장명/위경도) 부재면 형식 변경 의심 → 기존 유지.
  if (col.mgmtNo < 0 || col.name < 0 || col.lat < 0 || col.lng < 0) {
    await alertSourceFailure('CSV 파싱 실패: 필수 컬럼 없음 (원천 형식 변경 의심)');
    return NextResponse.json(
      { ok: false, error: 'parse failed: required columns not found', header, note: 'existing table kept (no truncate)' },
      { status: 502 },
    );
  }

  const at = (r: string[], idx: number): string | null => (idx >= 0 ? norm(r[idx]) : null);

  const dbRows: CarwashDbRow[] = [];
  const dist: Record<WashType, number> = { self: 0, hand: 0, auto: 0, unknown: 0 };
  let skippedNoCoord = 0;
  let skippedOutOfKorea = 0;
  let skippedAffiliated = 0; // 부설(주유·충전)
  let skippedNoKey = 0;
  const seen = new Set<string>(); // 파일 내 mgmt_no 중복 시 마지막 승(upsert 안전)

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && (r[0] ?? '').trim() === '') continue; // 빈 줄

    const mgmtNo = at(r, col.mgmtNo);
    const name = at(r, col.name);
    if (!mgmtNo || !name) { skippedNoKey++; continue; }

    const bizType = at(r, col.bizType);
    // ① 부설(주유·충전 업종) 제외 — 독립 세차장만 적재.
    if (bizType && (bizType.includes('주유') || bizType.includes('충전'))) { skippedAffiliated++; continue; }

    // ② 좌표 미채움 제외.
    const lat = Number(at(r, col.lat));
    const lng = Number(at(r, col.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) { skippedNoCoord++; continue; }

    // ③ 한반도 bbox 밖 드랍(이상치 가드).
    if (lat < KR_LAT_MIN || lat > KR_LAT_MAX || lng < KR_LNG_MIN || lng > KR_LNG_MAX) { skippedOutOfKorea++; continue; }

    const washType = normalizeWashType(at(r, col.washType), name);
    dist[washType]++;

    if (seen.has(mgmtNo)) {
      // 파일 내 중복: 앞서 넣은 행을 마지막 값으로 덮는다(안정성).
      const idx = dbRows.findIndex((x) => x.mgmt_no === mgmtNo);
      if (idx >= 0) dbRows.splice(idx, 1);
    }
    seen.add(mgmtNo);

    dbRows.push({
      mgmt_no: mgmtNo,
      name,
      wash_type: washType,
      road_addr: at(r, col.roadAddr),
      jibun_addr: at(r, col.jibunAddr),
      tel: at(r, col.tel),
      weekday_open: at(r, col.weekdayOpen),
      weekday_close: at(r, col.weekdayClose),
      holiday_open: at(r, col.holidayOpen),
      holiday_close: at(r, col.holidayClose),
      fee_info: at(r, col.feeInfo),
      closed_day: at(r, col.closedDay),
      lat,
      lng,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      biz_type_raw: bizType,
      data_base_date: toDate(at(r, col.baseDate)),
      sigungu_code: sigunguCodeFromAddress(at(r, col.roadAddr) ?? at(r, col.jibunAddr)),
      synced_at: now,
    });
  }

  if (dbRows.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'no importable rows after filtering', note: 'existing table kept (no truncate)' },
      { status: 502 },
    );
  }

  // 3) 청크 upsert(onConflict: mgmt_no). 실패 시 예외 → 기존 스냅샷 유지.
  let upserted = 0;
  try {
    const sb = getSupabase();
    upserted = await upsertInChunks(sb, dbRows);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `upsert error: ${(e as Error).message}`, upserted, note: 'partial upsert; existing rows kept (no truncate)' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    asOf: now,
    source: 'localdata car_wash_info',
    parsedRows: rows.length - 1,
    upserted,
    washTypeDist: dist, // self/hand/auto/unknown 분포(성공 지표 — unknown 비율 실측용)
    skipped: {
      noKey: skippedNoKey,
      affiliated: skippedAffiliated, // 부설(주유·충전) 제외
      noCoord: skippedNoCoord,
      outOfKorea: skippedOutOfKorea,
    },
    elapsedMs: Date.now() - startedAt,
  });
}
