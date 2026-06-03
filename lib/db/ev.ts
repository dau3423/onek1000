// 전기차 충전소 도메인 쿼리 — Supabase 미설정 시 mock 폴백 (lib/db/queries.ts와 동일 패턴).
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Bbox } from '@/lib/map/geo';
import { distanceMeters } from '@/lib/map/geo';
import type { EvChargerUnit, EvStationDetail, EvStationMarker } from '@/types/ev';
import { chargerSpeed } from '@/types/ev';
import { evGetChargerInfoByStatId } from '@/lib/ev/client';
import { toRow } from '@/lib/ev/row';
import {
  getMockEvChargersByBbox,
  getMockEvChargersByRadius,
  getMockEvStationDetail,
} from '@/lib/mock/ev';

interface BboxRpcRow {
  stat_id: string;
  name: string;
  lat: number;
  lng: number;
  busi_nm: string | null;
  total_chargers: number;
  available_chargers: number;
  has_fast: boolean;
  has_slow: boolean;
  max_output: number | null;
  latest_stat_upd_dt: string | null;
  synced_at: string | null;
}

function rpcRowToMarker(r: BboxRpcRow): EvStationMarker {
  return {
    statId: r.stat_id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    busiNm: r.busi_nm,
    totalChargers: r.total_chargers,
    availableChargers: r.available_chargers,
    hasFast: r.has_fast,
    hasSlow: r.has_slow,
    maxOutput: r.max_output,
    latestStatUpdAt: r.latest_stat_upd_dt,
    syncedAt: r.synced_at,
  };
}

/** bbox(지도 영역) 내 충전소 마커 — 충전소(statId) 단위 그룹 + 상태 집계. */
export async function queryEvChargersByBbox(bbox: Bbox, limit: number): Promise<EvStationMarker[]> {
  if (!isSupabaseConfigured()) {
    return getMockEvChargersByBbox(bbox, limit);
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('rpc_ev_chargers_by_bbox', {
    p_sw_lng: bbox.swLng, p_sw_lat: bbox.swLat,
    p_ne_lng: bbox.neLng, p_ne_lat: bbox.neLat,
    p_limit: limit,
  });
  if (error) throw new Error(`ev bbox query failed: ${error.message}`);
  return (data as BboxRpcRow[] ?? []).map(rpcRowToMarker);
}

/** 반경 내 충전소 마커 — bbox로 근사 후 거리 필터(내 주변 표시용). */
export async function queryEvChargersByRadius(
  lat: number, lng: number, radiusM: number, limit: number,
): Promise<EvStationMarker[]> {
  if (!isSupabaseConfigured()) {
    return getMockEvChargersByRadius(lat, lng, radiusM, limit);
  }
  // 반경을 포함하는 bbox로 1차 조회 후 거리로 정렬/절단(전용 RPC 없이 bbox RPC 재사용).
  const dLat = radiusM / 111_000;
  const dLng = radiusM / (111_000 * Math.cos((lat * Math.PI) / 180) || 1);
  const bbox: Bbox = {
    swLat: lat - dLat, swLng: lng - dLng,
    neLat: lat + dLat, neLng: lng + dLng,
  };
  const markers = await queryEvChargersByBbox(bbox, Math.max(limit * 4, 80));
  return markers
    .map((m) => ({ m, d: distanceMeters(lat, lng, m.lat, m.lng) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.m);
}

interface DetailRow {
  stat_id: string;
  chger_id: string;
  stat_nm: string;
  addr: string | null;
  addr_detail: string | null;
  lat: number;
  lng: number;
  chger_type: string | null;
  output_kw: number | null;
  use_time: string | null;
  busi_nm: string | null;
  busi_call: string | null;
  stat: string | null;
  stat_upd_dt: string | null;
  parking_free: boolean | null;
  synced_at: string | null;
}

/** statId로 충전소 상세 — 충전기 목록 + 정적 정보 + 상태 집계. */
export async function queryEvStationDetail(statId: string): Promise<EvStationDetail | null> {
  if (!isSupabaseConfigured()) return getMockEvStationDetail(statId);

  const sb = getSupabase();
  const { data, error } = await sb
    .from('ev_chargers')
    .select('stat_id, chger_id, stat_nm, addr, addr_detail, lat, lng, chger_type, output_kw, use_time, busi_nm, busi_call, stat, stat_upd_dt, parking_free, synced_at')
    .eq('stat_id', statId)
    .eq('del_yn', false);
  if (error) throw new Error(`ev detail query failed: ${error.message}`);
  const rows = (data as DetailRow[] ?? []);
  if (rows.length === 0) return null;

  const chargers: EvChargerUnit[] = rows.map((r) => ({
    statId: r.stat_id,
    chgerId: r.chger_id,
    chgerType: r.chger_type ?? '',
    output: r.output_kw,
    stat: r.stat ?? '0',
    statUpdAt: r.stat_upd_dt,
  }));

  const outputs = rows.map((r) => r.output_kw).filter((o): o is number => o != null);
  const updTimes = rows.map((r) => r.stat_upd_dt).filter((t): t is string => !!t).sort();
  const first = rows[0];
  const addr = first.addr_detail ? `${first.addr ?? ''} ${first.addr_detail}`.trim() : first.addr;

  return {
    statId,
    name: first.stat_nm,
    lat: first.lat,
    lng: first.lng,
    busiNm: first.busi_nm,
    totalChargers: rows.length,
    availableChargers: rows.filter((r) => r.stat === '2').length,
    hasFast: chargers.some((c) => chargerSpeed(c.chgerType, c.output) === 'fast'),
    hasSlow: chargers.some((c) => chargerSpeed(c.chgerType, c.output) === 'slow'),
    maxOutput: outputs.length ? Math.max(...outputs) : null,
    latestStatUpdAt: updTimes.length ? updTimes[updTimes.length - 1] : null,
    syncedAt: first.synced_at,
    address: addr || null,
    busiCall: first.busi_call,
    useTime: first.use_time,
    parkingFree: first.parking_free,
    chargers,
  };
}

// 같은 충전소를 이 시간(ms) 이내에 라이브 갱신했으면 data.go.kr 재호출을 스킵한다.
// 새로고침 연타로 외부 API를 때리지 않게 하는 과호출 방지(debounce). (기준=synced_at)
const LIVE_REFRESH_DEBOUNCE_MS = 45_000;

/**
 * 상세 진입 시 그 충전소(statId) 1곳만 라이브 갱신 후 DB값으로 반환 — 준실시간.
 *
 * 흐름:
 *  1) DB 상세를 먼저 조회(없으면 null). "상세=DB only" 원칙: 표시는 항상 우리 DB에서.
 *  2) 최근(LIVE_REFRESH_DEBOUNCE_MS 이내) 갱신됐으면 라이브 호출 스킵 → DB값 그대로(과호출 방지).
 *  3) 아니면 getChargerInfo(statId) 라이브 호출 → ev_chargers upsert → DB 재조회.
 *  4) 라이브 호출/upsert 실패·지연(타임아웃)이면 1)의 DB 스냅샷으로 폴백(페이지가 깨지지 않게).
 *
 * Mock 모드(Supabase 미설정)는 외부 호출 없이 mock 상세를 반환한다.
 */
export async function refreshAndQueryEvStationDetail(statId: string): Promise<EvStationDetail | null> {
  if (!isSupabaseConfigured()) return getMockEvStationDetail(statId);
  if (!process.env.EV_CHARGER_API_KEY) return queryEvStationDetail(statId);

  // 1) 폴백용 DB 스냅샷 먼저 확보.
  let snapshot: EvStationDetail | null = null;
  try {
    snapshot = await queryEvStationDetail(statId);
  } catch {
    snapshot = null;
  }

  // 2) debounce: 방금 갱신했으면 라이브 호출 생략.
  if (snapshot?.syncedAt) {
    const age = Date.now() - Date.parse(snapshot.syncedAt);
    if (Number.isFinite(age) && age >= 0 && age < LIVE_REFRESH_DEBOUNCE_MS) {
      return snapshot;
    }
  }

  // 3) 라이브 호출 + upsert. 실패/지연이면 스냅샷으로 폴백.
  try {
    const items = await evGetChargerInfoByStatId({ statId, timeoutMs: 8_000 });
    if (items.length === 0) return snapshot; // 응답 없음 → 기존값 유지.

    const now = new Date().toISOString();
    const rows = items.map((it) => toRow(it, now)).filter((r): r is NonNullable<typeof r> => r != null);
    if (rows.length === 0) return snapshot;

    const sb = getSupabase();
    const { error } = await sb.from('ev_chargers').upsert(rows, { onConflict: 'stat_id,chger_id' });
    if (error) return snapshot; // upsert 실패 → 기존값 유지.

    // 갱신된 값으로 재조회. 재조회 실패 시 스냅샷 폴백.
    const fresh = await queryEvStationDetail(statId);
    return fresh ?? snapshot;
  } catch {
    return snapshot;
  }
}
