// Cron (매일 1회) — 전국 주유소 "위치"를 시군구 중심(기존 stations 기반 probe)으로 증분 적재.
//
// 목적: stations 에 시군구별 최저가 TOP10(~6천)만 있어 회색 점(주변 모든 주유소 위치)이
//       일부만 보인다. Opinet aroundAll(반경 내 전체 주유소)로 "사람 사는 곳"만 골라 순회하며
//       주유소 "위치 행"(id/이름/브랜드/좌표/주소)만 stations 에 upsert 한다.
//
// 왜 격자 → probe 로 바꿨나:
//       기존 방식은 전국 bbox 를 ~5km 격자(약 1.7만 칸)로 순회해 바다/산간/빈 칸까지 다 호출했다.
//       한 바퀴 ~1.7만 콜이라 일 500콜이면 한 달 이상. 대부분이 빈 칸 낭비였다.
//       → 우리 DB stations(전 시군구 커버)의 좌표를 ~PROBE 격자로 스냅해, 주유소가 1개 이상
//         존재하는 셀만 probe 로 만든다. 사람 사는 곳에만 probe 가 생겨 바다 낭비 0,
//         probe 개수는 보통 수천 이하 → 일 500콜이면 며칠 안에 전국 한 바퀴.
//
// probe 방식 (B) 채택 이유: Opinet areaCode.do 는 시군구 코드/이름만 주고 좌표는 없어
//       (A) 시군구 중심좌표 방식은 250개 좌표를 별도 확보·하드코딩해야 한다. 우리 DB 는 이미
//       전 시군구 주유소 좌표를 보유하므로 (B)가 더 견고·정확하다.
//       한계: 기존 stations 가 전혀 없는 완전 미개척 시군구는 probe 가 안 생긴다. 그러나
//       우리 DB 는 전 시군구(최저가 TOP10 적재)를 커버하므로 사실상 누락 없음.
//
// 적응형 분할(밀집 대응): aroundAll 응답이 캡(SPLIT_THRESHOLD)에 근접/도달하면 그 지점은
//       주유소 밀집(반경 내 일부가 잘렸을 가능성) → 반경을 줄여 4분할 보조 점을 1단계 추가
//       조회해 빠진 주유소를 보완한다. 캡 미달이면 분할하지 않는다(과도한 콜 방지).
//       분할 조회도 콜 카운트에 포함되어 ?limit 가드를 넘지 않는다.
//
// 위치만 저장: prices_latest 는 건드리지 않는다(회색 점 소스 rpc_stations_in_bbox 는 가격을
//       요구하지 않음). 상세 진입 시 가격 폴백이 동작하므로 상세/길찾기/주유기록/즐겨찾기 모두 정상.
//
// 좌표계 주의: Opinet aroundAll 는 KATEC(TM128). 입력 x,y = KATEC, radius = m,
//       응답 GIS_X_COOR/GIS_Y_COOR = KATEC. → probe 중심(WGS84)을 wgs84ToKatec 으로 변환해
//       호출하고, 응답 좌표는 katecToWgs84 로 변환해 저장한다.
//
// 진행 커서: sync_cursor('backfill_stations').idx 에 probe 목록 인덱스를 보관. probe 목록은
//       매 실행마다 기존 stations 좌표로 결정적(정렬 고정)으로 동일 순서 재생성된다.
//       다음 실행은 (idx+1) probe 부터 콜 상한(?limit 기본 500)만큼 처리하고 전진·순환한다.
//
// 할당량 가드: aroundAll 호출 수(분할 포함)를 이번 run 상한(?limit, 기본 500)으로 제한한다.
//       sync-opinet 과 합쳐 일일 1,500 안에 들도록 운영(권장 ?limit=500).
//
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK / Supabase / OPINET_API_KEY 미설정 시 graceful skip.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { katecToWgs84, wgs84ToKatec } from '@/lib/map/katec';
import { BRAND_LABEL, type BrandCode, type SidoCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 콜 상한(기본 500)이 직렬에 가깝게 흐르므로 넉넉히 둔다.
export const maxDuration = 300;

const OPINET_BASE = 'https://www.opinet.co.kr/api';

// ─── probe 격자(기존 stations 스냅 단위) ───
// 기존 stations 좌표를 ~PROBE_DEG 격자로 스냅해 중복 제거한 셀 집합이 probe 가 된다.
// 위도 1° ≈ 111km, 경도 1° ≈ cos(36°)×111 ≈ 90km. ~3.5km 셀 ≈ 위도 0.0315° / 경도 0.039°.
// 단순화를 위해 위·경도 공통 스텝을 쓰되, 경도가 더 짧으므로 약간 보수적(작은 셀)으로 잡는다.
const PROBE_STEP_LAT = 0.032; // ≈ 3.6km
const PROBE_STEP_LNG = 0.040; // ≈ 3.6km

// aroundAll radius(m). probe 셀 반대각선(≈ 2.5km) 이상이면 셀 전체를 덮는다.
const PROBE_RADIUS_M = 3000;
// 적응형 분할 임계 — 메인 응답이 이 수 이상이면 밀집 → 4분할 보조 조회로 보완.
// 실측: aroundAll 응답 상한은 반경/지역에 따라 ~60건이며 엄격하지 않다(부산 r5000=72건 관측).
// 반경 3km(PROBE_RADIUS_M)에서는 최밀집 도심(강남 r3000=34건)도 상한에 직접 닿지 않으므로,
// "메인이 이미 빽빽한 셀"을 캡 잘림 직전에 분할하도록 상한(60)보다 충분히 낮은 30 으로 둔다.
const SPLIT_THRESHOLD = 30;
// 분할 시 보조 점 반경(m). 원 반경의 절반 수준 + 4점이 셀을 덮도록.
const SPLIT_RADIUS_M = 1800;
// 분할 보조 점 중심 오프셋(원 probe 중심 기준). 셀의 4분면 중심에 둔다.
const SPLIT_OFFSET_LAT = PROBE_STEP_LAT / 4;
const SPLIT_OFFSET_LNG = PROBE_STEP_LNG / 4;
// 콜당 최대 수집 행 — aroundAll 은 반경 내 전체를 주지만 응답을 이만큼만 사용(과대 페이로드 방지).
const PER_CALL_LIMIT = 100;
// 이번 run 기본 호출 상한(일일 한도 1,500 보수적 운용). ?limit 으로 조정.
const DEFAULT_CALL_LIMIT = 500;
const REQUEST_DELAY_MS = 80;
const UPSERT_CHUNK = 1000;
// 기존 stations 좌표 페이지네이션(probe 목록 구성용 조회). Supabase 기본 1k 제한 회피.
const STATIONS_PAGE = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** WGS84 좌표를 probe 격자 셀 인덱스(정수 행·열)로 스냅. */
function snapToCell(lat: number, lng: number): { row: number; col: number } {
  return {
    row: Math.floor(lat / PROBE_STEP_LAT),
    col: Math.floor(lng / PROBE_STEP_LNG),
  };
}

/** 셀(행·열) → 셀 중심(WGS84). */
function cellCenter(row: number, col: number): { lat: number; lng: number } {
  return {
    lat: (row + 0.5) * PROBE_STEP_LAT,
    lng: (col + 0.5) * PROBE_STEP_LNG,
  };
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
 */
function estimateSido(lat: number, lng: number): SidoCode {
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
  return '02';
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

/**
 * 기존 stations 좌표를 페이지네이션으로 모두 읽어 probe 격자 셀로 스냅·중복 제거한다.
 * 결과는 결정적 순서(row, col 오름차순)로 정렬해 커서 인덱싱을 안정화한다.
 * 반환: probe 중심 좌표(WGS84) 목록.
 */
async function buildProbes(
  sb: ReturnType<typeof getSupabase>,
): Promise<{ probes: { lat: number; lng: number }[]; stationsScanned: number }> {
  const cellKeys = new Set<string>();
  let stationsScanned = 0;
  let from = 0;
  // 안전 상한(무한루프 방지): 25만 행이면 충분.
  const MAX_PAGES = 250;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await sb
      .from('stations')
      .select('lat,lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + STATIONS_PAGE - 1);
    if (error) throw new Error(`stations scan: ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      const lat = Number((r as { lat: number | null }).lat);
      const lng = Number((r as { lng: number | null }).lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stationsScanned++;
      const { row, col } = snapToCell(lat, lng);
      cellKeys.add(`${row}:${col}`);
    }
    from += STATIONS_PAGE;
    if (rows.length < STATIONS_PAGE) break;
  }

  // 결정적 정렬: row → col 오름차순. (문자열 키 파싱)
  const cells = [...cellKeys].map((k) => {
    const [row, col] = k.split(':').map(Number);
    return { row, col };
  });
  cells.sort((a, b) => (a.row - b.row) || (a.col - b.col));

  const probes = cells.map(({ row, col }) => cellCenter(row, col));
  return { probes, stationsScanned };
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

  // ─── probe 목록 구성(기존 stations 기반, 결정적 순서) ───
  let probes: { lat: number; lng: number }[];
  let stationsScanned = 0;
  try {
    const built = await buildProbes(sb);
    probes = built.probes;
    stationsScanned = built.stationsScanned;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `probe build failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
  const totalProbes = probes.length;
  if (totalProbes === 0) {
    return NextResponse.json({
      ok: true, asOf: now, dryRun, totalProbes: 0, stationsScanned,
      note: '기존 stations 좌표가 없어 probe 가 생성되지 않았다(시드 적재 필요).',
    });
  }

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
      cursorAvailable = false;
      fetchErrors.push(`cursor load: ${error.message}`);
    } else if (data) {
      const v = Number(data.idx);
      startIdx = Number.isFinite(v) ? ((v + 1) % totalProbes) : 0; // 마지막 처리 다음 probe부터
    }
  }

  // ─── probe 순회: callLimit 만큼 호출(분할 포함) ───
  const stationMap = new Map<string, Record<string, unknown>>();
  let calls = 0;
  let probesProcessed = 0;
  let emptyProbes = 0;
  let splitCount = 0;
  let coordSkipped = 0;
  let lastProcessedIdx = startIdx === 0 ? totalProbes - 1 : startIdx - 1; // 아무것도 안 돌면 커서 불변
  let wrapped = false;

  // 응답 OIL 행을 stationMap 에 누적(위치 전용).
  const collect = (oils: AroundOil[]) => {
    for (const o of oils.slice(0, PER_CALL_LIMIT)) {
      const id = String(o.UNI_ID ?? '').trim();
      if (!id) continue;
      const wgs = katecToWgs84(Number(o.GIS_X_COOR), Number(o.GIS_Y_COOR));
      if (!wgs) { coordSkipped++; continue; }
      const brand = toBrandCode(o.POLL_DIV_CD);
      // 위치 전용 행. prices_latest 는 절대 건드리지 않는다.
      // onConflict id 로 기존(최저가 TOP10 적재분) 위치·이름만 갱신(가격 컬럼 미포함 → 보존).
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
  };

  // probe 를 하나씩 처리. 단, 콜 가드(분할까지 합쳐 callLimit 초과 금지)를 매 호출 전에 확인.
  // 한 probe 의 메인 콜이 들어갈 여유가 없으면 그 probe 는 처리하지 않고 커서를 전진시키지 않는다.
  for (let n = 0; n < totalProbes; n++) {
    if (calls >= callLimit) break;
    const idx = (startIdx + n) % totalProbes;
    if (n > 0 && idx === 0) wrapped = true; // 한 바퀴 순환 경계 통과

    const center = probes[idx];
    const katec = wgs84ToKatec(center.lng, center.lat);
    if (!katec) { lastProcessedIdx = idx; probesProcessed++; continue; } // 변환 불가 probe 는 건너뛰되 커서 전진

    // ── 메인 콜 ──
    calls++;
    let mainCount = 0;
    try {
      const oils = await opinetAroundAll(katec.x, katec.y, PROBE_RADIUS_M);
      mainCount = oils.length;
      if (oils.length === 0) emptyProbes++;
      collect(oils);
    } catch (e) {
      fetchErrors.push(`probe ${idx}: ${(e as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);

    // ── 적응형 분할(1단계, 4분할) ──
    // 메인 응답이 캡 근접이면 셀을 4분면으로 나눠 보조 점에서 추가 조회(빠진 주유소 보완).
    // 각 보조 콜도 callLimit 가드를 따른다(여유 없으면 분할 중단).
    if (mainCount >= SPLIT_THRESHOLD) {
      splitCount++;
      const quads: Array<[number, number]> = [
        [center.lat + SPLIT_OFFSET_LAT, center.lng + SPLIT_OFFSET_LNG],
        [center.lat + SPLIT_OFFSET_LAT, center.lng - SPLIT_OFFSET_LNG],
        [center.lat - SPLIT_OFFSET_LAT, center.lng + SPLIT_OFFSET_LNG],
        [center.lat - SPLIT_OFFSET_LAT, center.lng - SPLIT_OFFSET_LNG],
      ];
      for (const [qLat, qLng] of quads) {
        if (calls >= callLimit) break;
        const qKatec = wgs84ToKatec(qLng, qLat);
        if (!qKatec) continue;
        calls++;
        try {
          const qOils = await opinetAroundAll(qKatec.x, qKatec.y, SPLIT_RADIUS_M);
          collect(qOils);
        } catch (e) {
          fetchErrors.push(`probe ${idx} split: ${(e as Error).message}`);
        }
        await sleep(REQUEST_DELAY_MS);
      }
    }

    lastProcessedIdx = idx;
    probesProcessed++;
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
  if (!dryRun && cursorAvailable && probesProcessed > 0) {
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
    probe: {
      stepLat: PROBE_STEP_LAT, stepLng: PROBE_STEP_LNG,
      radiusM: PROBE_RADIUS_M, splitThreshold: SPLIT_THRESHOLD, splitRadiusM: SPLIT_RADIUS_M,
    },
    stationsScanned,               // probe 구성에 스캔한 기존 stations 행 수
    totalProbes,                   // 결정적 probe 셀 총 개수
    callLimit,
    calls,                         // 실제 aroundAll 호출 수(메인+분할, 이번 run)
    probesProcessed,               // 이번 run 에 메인 콜까지 처리한 probe 수
    emptyProbes,                   // 주유소 0건 probe(보통 0에 가까움)
    splitCount,                    // 캡 근접으로 4분할 보조 조회한 probe 수
    cursor: { start: startIdx, last: lastProcessedIdx, saved: cursorSaved, available: cursorAvailable, wrapped },
    stationsCollected: stationRows.length,
    upserted,
    coordSkipped,
    fetchErrors: fetchErrors.length ? fetchErrors : undefined,
  });
}
