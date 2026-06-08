// Cron (매일 1회) — 전국 주유소 "위치"를 격자 순회로 매일 조금씩 증분 적재.
//
// 목적: stations 에 시군구별 최저가 TOP10(~6천)만 있어 회색 점(주변 모든 주유소 위치)이
//       일부만 보인다. Opinet aroundAll(반경 내 전체 주유소)로 전국을 ~5km 격자로 순회하며
//       주유소 "위치 행"(id/이름/브랜드/좌표/주소)만 stations 에 upsert 한다.
//
// 위치만 저장: prices_latest 는 건드리지 않는다(회색 점 소스 rpc_stations_in_bbox 는 가격을
//       요구하지 않음). 상세 진입 시 queryStationDetailWithPriceFallback 가 Opinet 으로 가격을
//       1회 폴백·표시하므로 상세/길찾기/주유기록/즐겨찾기 모두 정상 동작한다(추가 작업 불필요).
//
// 좌표계 주의: Opinet aroundAll 는 KATEC(TM128) 좌표계다.
//       입력 x,y = KATEC, radius = m, 응답 GIS_X_COOR/GIS_Y_COOR = KATEC.
//       → 셀 중심(WGS84) 을 wgs84ToKatec 으로 변환해 호출하고,
//         응답 좌표는 katecToWgs84 로 변환해 저장한다.
//
// 진행 커서: 매 실행마다 sync_cursor('backfill_stations').idx 다음 셀부터 콜 상한(기본 40)만큼
//       처리하고 커서를 전진한다. 끝 셀에 도달하면 처음으로 순환한다(주기적 갱신).
//
// 할당량 가드: aroundAll 호출 수를 이번 run 상한(?limit, 기본 40)으로 제한한다.
//       sync-opinet(~1,420/1,500)과 합쳐 1,500 안에 들도록 보수적 기본값을 쓴다.
//
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK / Supabase / OPINET_API_KEY 미설정 시 graceful skip.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { katecToWgs84, wgs84ToKatec } from '@/lib/map/katec';
import { BRAND_LABEL, type BrandCode, type SidoCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 콜 상한(기본 40)이 직렬에 가깝게 흐르므로 넉넉히 둔다(상한을 크게 주는 운영 실행 대비).
export const maxDuration = 300;

const OPINET_BASE = 'https://www.opinet.co.kr/api';

// ─── 전국 본토 격자 (WGS84) ───
// 한국 본토 대략 bbox. 셀 ~5km(위도 1° ≈ 111km → 5km ≈ 0.045°,
// 경도 1° ≈ cos(36°)×111 ≈ 90km → 5km ≈ 0.056°).
const GRID = {
  minLat: 33.0,
  maxLat: 38.7,
  minLng: 124.5,
  maxLng: 132.0,
  stepLat: 0.045,
  stepLng: 0.056,
} as const;

// aroundAll radius(m). 셀 반경(반대각선 ≈ 3.5km) 이상이면 셀 전체를 덮는다.
const CELL_RADIUS_M = 3500;
// 콜당 최대 수집 행 — aroundAll 은 반경 내 전체를 주지만 응답을 이만큼만 사용(과대 페이로드 방지).
const PER_CELL_LIMIT = 100;
// 이번 run 기본 호출 상한(일일 한도 1,500 보수적 운용). ?limit 으로 조정.
const DEFAULT_CALL_LIMIT = 40;
const REQUEST_DELAY_MS = 80;
const UPSERT_CHUNK = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LNG_CELLS = Math.ceil((GRID.maxLng - GRID.minLng) / GRID.stepLng);
const LAT_CELLS = Math.ceil((GRID.maxLat - GRID.minLat) / GRID.stepLat);
const TOTAL_CELLS = LNG_CELLS * LAT_CELLS;

/** 셀 인덱스 → 셀 중심(WGS84). row-major(위도 행 × 경도 열). */
function cellCenter(idx: number): { lat: number; lng: number } {
  const row = Math.floor(idx / LNG_CELLS); // 위도 방향
  const col = idx % LNG_CELLS;             // 경도 방향
  const lat = GRID.minLat + (row + 0.5) * GRID.stepLat;
  const lng = GRID.minLng + (col + 0.5) * GRID.stepLng;
  return { lat, lng };
}

/** Opinet 브랜드 코드 정규화 — 알 수 없는 값은 'ETC' 폴백. */
function toBrandCode(raw?: string): BrandCode {
  const v = (raw ?? '').trim();
  return (v && v in BRAND_LABEL ? v : 'ETC') as BrandCode;
}

/**
 * 좌표 기반 시도 코드 추정(폴백). aroundAll 응답엔 시도가 없고 sido_code 가 NOT NULL 이라
 * 대략적인 광역 bbox 로만 분류한다(정확도보다 NOT NULL 충족·대략 분류가 목적).
 * 회색 점 RPC(rpc_stations_in_bbox)는 sido_code 를 읽지 않으므로 표시에는 영향 없다.
 * 어디에도 안 맞으면 '01'(서울) 폴백.
 */
function estimateSido(lat: number, lng: number): SidoCode {
  // (대략 경계 — 광역 단위 근사) sido 코드: 01서울 02경기 03강원 04충북 05충남 06전북
  // 07전남 08경북 09경남 10부산 11제주 14인천 15광주 16대전 17울산 18대구 19세종
  if (lat < 33.7) return '11';                         // 제주
  if (lat < 35.3 && lng > 128.8) return '10';          // 부산권(남동)
  if (lat < 35.3) return '09';                         // 경남
  if (lng < 126.6 && lat < 35.5) return '07';          // 전남
  if (lng < 126.9 && lat < 36.3) return '06';          // 전북
  if (lng > 128.5 && lat < 36.5) return '09';          // 경남 북부
  if (lng > 128.5) return '08';                         // 경북
  if (lng < 127.2 && lat < 37.0) return '05';          // 충남
  if (lat < 37.0) return '04';                         // 충북
  if (lng > 127.9) return '03';                         // 강원
  if (lat > 37.4 && lng < 127.2) return '02';          // 경기/서울권
  return '02';                                          // 그 외 수도권 → 경기 폴백
}

interface AroundOil {
  UNI_ID?: string;
  OS_NM?: string;
  POLL_DIV_CD?: string;
  NEW_ADR?: string;
  VAN_ADR?: string;
  GIS_X_COOR?: number | string;
  GIS_Y_COOR?: number | string;
}

/** aroundAll.do — 반경 내 전체 주유소(KATEC 입력/출력). prodcd 는 응답 필터일 뿐 위치는 동일. */
async function opinetAroundAll(katecX: number, katecY: number, radiusM: number): Promise<AroundOil[]> {
  const code = process.env.OPINET_API_KEY;
  if (!code) throw new Error('OPINET_API_KEY missing');
  const url =
    `${OPINET_BASE}/aroundAll.do?out=json&code=${code}` +
    `&x=${katecX}&y=${katecY}&radius=${radiusM}&prodcd=B027&sort=1`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`opinet ${res.status}`);
  const data = await res.json();
  const oils = data?.RESULT?.OIL;
  return Array.isArray(oils) ? (oils as AroundOil[]) : [];
}

async function inChunks<T>(
  rows: T[],
  size: number,
  fn: (chunk: T[]) => Promise<{ error: { message: string } | null }>,
  label: string,
) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await fn(chunk);
    if (error) throw new Error(`${label} failed (rows ${i}-${i + chunk.length}): ${error.message}`);
  }
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured() || !process.env.OPINET_API_KEY) {
    return NextResponse.json({ skipped: true, reason: 'mock mode or missing config' });
  }

  const u = new URL(req.url);
  const reqLimit = Number(u.searchParams.get('limit'));
  const callLimit = Number.isFinite(reqLimit) && reqLimit > 0 ? Math.floor(reqLimit) : DEFAULT_CALL_LIMIT;
  const dryRun = u.searchParams.get('dryRun') === '1' || u.searchParams.get('dryRun') === 'true';

  const sb = getSupabase();
  const now = new Date().toISOString();
  const fetchErrors: string[] = [];

  // ─── 커서 로드 (없으면 0) ───
  let startIdx = 0;
  let cursorAvailable = true;
  {
    const { data, error } = await sb
      .from('sync_cursor')
      .select('idx')
      .eq('key', 'backfill_stations')
      .maybeSingle();
    if (error) {
      // 테이블 미적용 등 — best-effort. idx=0 부터, 저장도 스킵.
      cursorAvailable = false;
      fetchErrors.push(`cursor load: ${error.message}`);
    } else if (data) {
      const v = Number(data.idx);
      startIdx = Number.isFinite(v) ? ((v + 1) % TOTAL_CELLS) : 0; // 마지막 처리 다음 셀부터
    }
  }

  // ─── 격자 순회: callLimit 만큼 셀 처리 ───
  const stationMap = new Map<string, Record<string, unknown>>();
  let calls = 0;
  let emptyCells = 0;
  let coordSkipped = 0;
  let lastProcessedIdx = startIdx === 0 ? TOTAL_CELLS - 1 : startIdx - 1; // 아무것도 안 돌면 커서 불변
  let wrapped = false;

  for (let n = 0; n < callLimit; n++) {
    const idx = (startIdx + n) % TOTAL_CELLS;
    if (n > 0 && idx === 0) wrapped = true; // 한 바퀴 순환 경계 통과

    const center = cellCenter(idx);
    const katec = wgs84ToKatec(center.lng, center.lat);
    if (!katec) { lastProcessedIdx = idx; continue; } // 변환 불가 셀은 건너뛰되 커서는 전진

    calls++;
    try {
      const oils = await opinetAroundAll(katec.x, katec.y, CELL_RADIUS_M);
      if (oils.length === 0) emptyCells++;
      for (const o of oils.slice(0, PER_CELL_LIMIT)) {
        const id = String(o.UNI_ID ?? '').trim();
        if (!id) continue;
        const wgs = katecToWgs84(Number(o.GIS_X_COOR), Number(o.GIS_Y_COOR));
        if (!wgs) { coordSkipped++; continue; }
        const brand = toBrandCode(o.POLL_DIV_CD);
        // 위치 전용 행. prices_latest 는 절대 건드리지 않는다.
        // onConflict id 로 기존(최저가 TOP10 적재분) 위치·이름만 갱신(가격/부가서비스 컬럼 미포함 → 보존).
        // UNI_ID 는 'A...' 라 고속도로(EX-) 행과 충돌하지 않는다.
        stationMap.set(id, {
          id,
          name: o.OS_NM ?? id,
          brand_code: brand,
          brand_name: BRAND_LABEL[brand] ?? BRAND_LABEL.ETC,
          address: o.NEW_ADR ?? o.VAN_ADR ?? null,
          sido_code: estimateSido(wgs.lat, wgs.lng),
          lat: wgs.lat,
          lng: wgs.lng,
          geom: `SRID=4326;POINT(${wgs.lng} ${wgs.lat})`,
          updated_at: now,
        });
      }
    } catch (e) {
      fetchErrors.push(`cell ${idx}: ${(e as Error).message}`);
    }
    lastProcessedIdx = idx;
    await sleep(REQUEST_DELAY_MS);
  }

  const stationRows = [...stationMap.values()];

  // ─── upsert(위치 전용) ───
  let upserted = 0;
  if (!dryRun && stationRows.length > 0) {
    try {
      await inChunks(stationRows, UPSERT_CHUNK,
        async (chunk) => await sb.from('stations').upsert(chunk, { onConflict: 'id' }),
        'stations upsert');
      upserted = stationRows.length;
    } catch (e) {
      fetchErrors.push(`upsert: ${(e as Error).message}`);
    }
  }

  // ─── 커서 전진 ───
  let cursorSaved = false;
  if (!dryRun && cursorAvailable) {
    const { error } = await sb
      .from('sync_cursor')
      .upsert({ key: 'backfill_stations', idx: lastProcessedIdx, updated_at: now }, { onConflict: 'key' });
    if (error) fetchErrors.push(`cursor save: ${error.message}`);
    else cursorSaved = true;
  }

  return NextResponse.json({
    ok: true,
    asOf: now,
    dryRun,
    grid: { latCells: LAT_CELLS, lngCells: LNG_CELLS, totalCells: TOTAL_CELLS, cellRadiusM: CELL_RADIUS_M },
    callLimit,
    calls,                         // 실제 aroundAll 호출 수(이번 run)
    emptyCells,                    // 주유소 0건 셀(바다/산간 등)
    cursor: { start: startIdx, last: lastProcessedIdx, saved: cursorSaved, available: cursorAvailable, wrapped },
    remaining: TOTAL_CELLS - calls, // 참고용(전체 셀 대비 이번에 안 돈 셀 근사)
    stationsCollected: stationRows.length,
    upserted,
    coordSkipped,
    fetchErrors: fetchErrors.length ? fetchErrors : undefined,
  });
}
