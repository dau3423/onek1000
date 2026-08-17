// Cron (수동/증분) — 주유소 마커 계통 오차 보정. 주소를 카카오 로컬 지오코딩해
//       가드(bbox 내장 + 1.5km) 통과분만 stations.lat/lng/geom 을 카카오 좌표로 교체한다.
//
// 목적: stations 좌표는 sync-opinet 이 오피넷 KATEC 변환값으로 매일 적재한 값이다. 바탕지도가
//       카카오맵이라 오피넷 변환 좌표와 카카오 지오코딩 위치가 계통적으로 어긋나 마커가 옆 건물/
//       길 건너에 찍힌다. 각 주유소 주소를 카카오로 지오코딩해 실제 위치에 더 가깝게 옮긴다.
//
// 파괴 방지(핵심): 지오코딩 결과를 무조건 반영하지 않는다. (a)한반도 bbox(kakao.ts 내장 검증)
//       (b)기존 오피넷 좌표와 ADOPT_MAX_DISTANCE_M(1.5km) 이내일 때만 채택한다. 엉뚱한 동명
//       매칭/도로명 오검색으로 멀리 떨어진 지점은 rejected 로 버리고 원본 좌표를 유지한다.
//       채택 시에만 lat/lng/geom 을 함께 갱신한다(불일치 없음).
//
// 증분 순회: stations 를 id 오름차순으로 페이지네이션 순회한다. sync_cursor('backfill_geocode')
//       에 마지막 처리 오프셋을 보관해 다음 run 이 그 다음 주유소부터 이어간다(resume, 순환 시 wrapped).
//       ?limit(기본 500)=이번 run 카카오 지오코딩 호출 상한. 상한 도달 시 중단하고 커서를 저장한다.
//
// 출처 보존(0039): 컬럼(coord_source/opinet_lat/opinet_lng) 존재 시 채택 행에 coord_source='kakao'
//       와 원본 오피넷 좌표를 기록한다(이미 있으면 보존). 컬럼 부재(0039 미적용)면 좌표만 갱신한다
//       (graceful degrade). sync-opinet 은 coord_source='kakao' 행 좌표를 보존한다(원위치 회귀 방지).
//
// 좌표 갱신은 upsert 가 아니라 id 기준 .update() 로 한다 — 부분 payload upsert 는 stations 의
//       NOT NULL(brand_code 등) INSERT 절을 건드려 실패하므로(sync-opinet amenity update 전례),
//       채택 행의 lat/lng/geom(+가능시 coord_source/opinet_lat/lng)만 update 한다.
//
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK / Supabase / 카카오 키(isGeocodeConfigured) 미설정 시 graceful skip.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { geocode, isGeocodeConfigured } from '@/lib/geocode/kakao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 지오코딩 호출이 딜레이(80ms)로 직렬에 가깝게 흐른다(500콜 ≈ 40s + 채택 행 update). 넉넉히 둔다.
export const maxDuration = 300;

// stations 페이지네이션 단위(Supabase 기본 1k 제한 회피).
const STATIONS_PAGE = 1000;
// 이번 run 기본 카카오 지오코딩 호출 상한(일 100,000 한도 대비 보수적). ?limit 으로 조정.
const DEFAULT_CALL_LIMIT = 500;
// 카카오 호출 사이 딜레이(초당 제한 회피).
const REQUEST_DELAY_MS = 80;
// 채택 가드: 기존 오피넷 좌표와 이 거리(m) 이내일 때만 카카오 좌표를 채택한다. 초과 시 원본 유지.
const ADOPT_MAX_DISTANCE_M = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 위도 1도 ≈ 111,320m. 경도 1도 ≈ 111,320 × cos(lat). 오프셋 성분(m) 환산 상수.
const M_PER_DEG = 111320;

/** 두 WGS84 좌표 간 거리(m) — 하버사인. */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 지구 반경(m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** 백분위수(0~1, nearest-rank). 오프셋 꼬리값 관측용. */
function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[idx];
}

// 거리 히스토그램 경계(m) — 채택분이 어느 구간에 몰리는지 본다. 계통 오차(수십~수백m)와
// 오매칭 의심 구간(500m+)을 분리해, ADOPT_MAX_DISTANCE_M 을 좁힐지 판단하는 근거가 된다.
const DIST_BUCKETS = [50, 100, 200, 300, 500, 1000, 1500];

function histogram(xs: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  let prev = 0;
  for (const b of DIST_BUCKETS) {
    out[`<${b}`] = xs.filter((x) => x >= prev && x < b).length;
    prev = b;
  }
  return out;
}

interface StationRow {
  id: string;
  address: string | null;
  name: string | null;
  lat: number | null;
  lng: number | null;
  coord_source?: string | null;
  opinet_lat?: number | null;
  opinet_lng?: number | null;
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  // CRON_SECRET 빈값 가드 — 미설정 시 무조건 거부(Authorization: Bearer undefined 우회 차단).
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (secret.length === 0 || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Mock/Supabase/카카오 키 미설정 시 좌표를 전혀 변경하지 않고 즉시 반환.
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
    return NextResponse.json({ skipped: true, reason: 'mock mode' });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'supabase not configured' });
  }
  if (!isGeocodeConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'kakao geocode key missing' });
  }

  const u = new URL(req.url);
  const reqLimit = Number(u.searchParams.get('limit'));
  const callLimit = Number.isFinite(reqLimit) && reqLimit > 0 ? Math.floor(reqLimit) : DEFAULT_CALL_LIMIT;
  const dryRun = u.searchParams.get('dryRun') === '1' || u.searchParams.get('dryRun') === 'true';

  const sb = getSupabase();
  const now = new Date().toISOString();
  const errors: string[] = [];

  // ─── 0039 컬럼 존재 감지(1회) ───
  // coord_source 를 select 해보고 에러면 컬럼 부재(0039 미적용)로 판정 → 좌표만 갱신하는 폴백.
  let columnsAvailable = true;
  {
    const { error } = await sb.from('stations').select('coord_source').limit(1);
    if (error) columnsAvailable = false;
  }
  const selectCols = columnsAvailable
    ? 'id, address, name, lat, lng, coord_source, opinet_lat, opinet_lng'
    : 'id, address, name, lat, lng';

  // ─── 전체 주유소 수(순환/wrap 판정용) ───
  let total = 0;
  {
    const { count, error } = await sb.from('stations').select('id', { count: 'exact', head: true });
    if (error) {
      return NextResponse.json({ ok: false, error: `stations count failed: ${error.message}` }, { status: 500 });
    }
    total = count ?? 0;
  }
  if (total === 0) {
    return NextResponse.json({ ok: true, asOf: now, dryRun, total: 0, note: 'stations 비어 있음(시드 적재 필요).' });
  }

  // ─── 커서 로드(없으면 0) — 마지막 처리 다음 오프셋부터 resume ───
  let startIdx = 0;
  let cursorAvailable = true;
  {
    const { data, error } = await sb
      .from('sync_cursor')
      .select('idx')
      .eq('key', 'backfill_geocode')
      .maybeSingle();
    if (error) {
      cursorAvailable = false;
      errors.push(`cursor load: ${error.message}`);
    } else if (data) {
      const v = Number(data.idx);
      startIdx = Number.isFinite(v) ? ((v + 1) % total) : 0;
    }
  }

  // ─── 순회 상태 ───
  let attempted = 0;      // 이번 run 에 살펴본 주유소 수
  let geocodeCalls = 0;   // 실제 카카오 호출 수
  let adopted = 0;
  let rejected = 0;       // 가드(1.5km) 탈락
  let geocodeFailed = 0;  // 카카오 null 반환
  let noAddress = 0;      // 주소 없음(호출 없이 skip)
  let stepped = 0;        // 이번 run 에 전진한 주유소 수(총 <= total 로 중복 순회 방지)
  let wrapped = false;
  // 아무것도 처리 못 하면 커서 불변(직전 마지막 인덱스로 되돌림).
  let lastProcessedIdx = startIdx === 0 ? total - 1 : startIdx - 1;

  // 채택분 오프셋 집계(기존 오피넷 좌표 존재분만).
  const northArr: number[] = [];
  const eastArr: number[] = [];
  const distArr: number[] = [];

  // 채택 행 update 큐(dryRun 이면 write 안 함).
  const updates: Array<Record<string, unknown> & { id: string }> = [];

  const fetchPage = async (offset: number): Promise<StationRow[]> => {
    const { data, error } = await sb
      .from('stations')
      .select(selectCols)
      .order('id', { ascending: true })
      .range(offset, offset + STATIONS_PAGE - 1);
    if (error) throw new Error(`stations page(${offset}): ${error.message}`);
    return (data ?? []) as unknown as StationRow[];
  };

  // startIdx 부터 페이지 단위로 순회. 콜 상한 도달 또는 total 만큼 전진하면 중단. 끝에 닿으면 0 으로 wrap.
  let curOffset = startIdx;
  try {
    outer: while (stepped < total && geocodeCalls < callLimit) {
      const page = await fetchPage(curOffset);
      if (page.length === 0) {
        // 끝(또는 startIdx 가 total 근처)에 닿음 → 0 으로 순환.
        if (curOffset === 0) break; // 안전(빈 결과 반복 방지)
        curOffset = 0;
        wrapped = true;
        continue;
      }
      for (let j = 0; j < page.length; j++) {
        if (geocodeCalls >= callLimit || stepped >= total) break outer;
        const absIdx = curOffset + j;
        const st = page[j];

        attempted++;
        lastProcessedIdx = absIdx;
        stepped++;

        const address = (st.address ?? '').trim();
        if (!address) { noAddress++; continue; }

        geocodeCalls++;
        const geo = await geocode(address, st.name ?? undefined);
        await sleep(REQUEST_DELAY_MS);
        if (!geo) { geocodeFailed++; continue; }

        // 가드: 기존 오피넷 좌표와의 거리. bbox 는 kakao.ts 가 이미 검증했으므로 거리만 판정.
        const oldLat = Number(st.lat);
        const oldLng = Number(st.lng);
        const hasOld = Number.isFinite(oldLat) && Number.isFinite(oldLng);
        if (hasOld) {
          const dist = haversineM(oldLat, oldLng, geo.lat, geo.lng);
          if (dist > ADOPT_MAX_DISTANCE_M) { rejected++; continue; }
          // 오프셋 집계(채택분, 기존 좌표 존재분만).
          northArr.push((geo.lat - oldLat) * M_PER_DEG);
          eastArr.push((geo.lng - oldLng) * M_PER_DEG * Math.cos((oldLat * Math.PI) / 180));
          distArr.push(dist);
        }
        // 기존 좌표가 없으면(드묾) bbox 검증만으로 채택 — 오프셋 집계에서는 제외.

        adopted++;
        const row: Record<string, unknown> & { id: string } = {
          id: st.id,
          lat: geo.lat,
          lng: geo.lng,
          geom: `SRID=4326;POINT(${geo.lng} ${geo.lat})`,
        };
        if (columnsAvailable) {
          row.coord_source = 'kakao';
          // 덮기 전 원본 오피넷 좌표를 1회 보존(이미 있으면 유지). 재실행 시 원본 유실 방지.
          const existingOpLat = Number(st.opinet_lat);
          const existingOpLng = Number(st.opinet_lng);
          row.opinet_lat = Number.isFinite(existingOpLat) ? existingOpLat : (hasOld ? oldLat : null);
          row.opinet_lng = Number.isFinite(existingOpLng) ? existingOpLng : (hasOld ? oldLng : null);
        }
        updates.push(row);
      }
      curOffset += page.length;
      if (curOffset >= total) { curOffset = 0; wrapped = true; }
    }
  } catch (e) {
    errors.push((e as Error).message);
  }

  // ─── 채택 행 write(id 기준 update, dryRun 이면 skip) ───
  let updated = 0;
  if (!dryRun && updates.length > 0) {
    for (const row of updates) {
      const { id, ...fields } = row;
      const { error } = await sb.from('stations').update(fields).eq('id', id);
      if (error) errors.push(`update ${id}: ${error.message}`);
      else updated++;
    }
  }

  // ─── 커서 전진(dryRun 이면 skip) ───
  let cursorSaved = false;
  if (!dryRun && cursorAvailable && stepped > 0) {
    const { error } = await sb
      .from('sync_cursor')
      .upsert({ key: 'backfill_geocode', idx: lastProcessedIdx, updated_at: now }, { onConflict: 'key' });
    if (error) errors.push(`cursor save: ${error.message}`);
    else cursorSaved = true;
  }

  const adoptRate = geocodeCalls > 0 ? Number((adopted / geocodeCalls).toFixed(3)) : 0;

  return NextResponse.json({
    ok: true,
    asOf: now,
    dryRun,
    total,                 // 전체 주유소 수(순환 기준)
    attempted,             // 이번 run 에 살펴본 주유소 수
    geocodeCalls,          // 실제 카카오 지오코딩 호출 수(할당량 소비 모니터링)
    requestDelayMs: REQUEST_DELAY_MS,
    adopted,
    adoptRate,             // adopted / geocodeCalls
    rejected,              // 1.5km 초과로 탈락(원본 좌표 유지)
    geocodeFailed,         // 카카오 null 반환
    noAddress,             // 주소 없음(호출 없이 skip)
    updated,               // 실제 write 한 행 수
    adoptMaxDistanceM: ADOPT_MAX_DISTANCE_M,
    limit: callLimit,
    cursor: { start: startIdx, last: lastProcessedIdx, saved: cursorSaved, available: cursorAvailable, wrapped },
    columnsAvailable,      // 0039 컬럼 감지 결과(false 면 좌표만 갱신, 채택 좌표는 다음 sync 에 덮일 수 있음)
    offset: {
      count: distArr.length,
      meanNorthM: Number(mean(northArr).toFixed(1)),  // +북 / -남
      meanEastM: Number(mean(eastArr).toFixed(1)),    // +동 / -서
      meanM: Number(mean(distArr).toFixed(1)),
      medianM: Number(median(distArr).toFixed(1)),
      // 꼬리값 — 오매칭(동명 주유소/도로명 실패)이 1.5km 가드 안으로 들어오는지 판단한다.
      p90M: Number(percentile(distArr, 0.9).toFixed(1)),
      p95M: Number(percentile(distArr, 0.95).toFixed(1)),
      maxM: Number((distArr.length ? Math.max(...distArr) : 0).toFixed(1)),
      histM: histogram(distArr),
    },
    errors: errors.length ? errors : undefined,
  });
}
