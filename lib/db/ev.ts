// 전기차 충전소 도메인 쿼리 — Supabase 미설정 시 mock 폴백 (lib/db/queries.ts와 동일 패턴).
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Bbox } from '@/lib/map/geo';
import { distanceMeters } from '@/lib/map/geo';
import type { EvChargerUnit, EvStationDetail, EvStationMarker } from '@/types/ev';
import { chargerSpeed } from '@/types/ev';
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
