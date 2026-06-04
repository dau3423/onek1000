// 내가 주유한 주유소(distinct) 목록 — 마이페이지 "지도로 보기" 핀 표시용.
// 로그인 필요, 본인 기록만. 사용자의 fuel_logs를 station_id 기준으로 묶어
// 방문 횟수/마지막 방문 시각을 집계하고, 좌표는 stations(주유소)/ev_chargers(충전소)에서 조인한다.
// fuel_logs엔 좌표가 없으므로 반드시 조인이 필요하다. 보통 수~수십 곳이라 가볍게 JS 집계.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import type { FuelLogStation } from '@/types/fuel-log';

export const runtime = 'nodejs';

async function getUserId(email: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  return data?.id ?? null;
}

interface LogRow {
  station_id: string;
  station_name: string;
  kind: string | null;
  logged_at: string;
}

interface Agg {
  stationId: string;
  stationName: string;
  isEv: boolean;
  visitCount: number;
  lastLoggedAt: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ stations: [] });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ stations: [] });

  const sb = getSupabase();

  // 사용자의 모든 기록을 가볍게(좌표 없는 식별 컬럼만) 가져와 station_id로 집계.
  // 한 사람당 기록은 보통 수십~수백 건이라 select 후 JS 집계로 충분(과한 로드 아님).
  const { data, error } = await sb
    .from('fuel_logs')
    .select('station_id, station_name, kind, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false });
  if (error) return NextResponse.json({ error: '조회에 실패했어요.' }, { status: 500 });

  const rows = (data ?? []) as LogRow[];
  if (rows.length === 0) return NextResponse.json({ stations: [] });

  // station_id 기준 집계(방문 횟수 + 최신 방문 시각, 최신 station_name 스냅샷).
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const isEv = r.kind === 'ev';
    const existing = map.get(r.station_id);
    if (existing) {
      existing.visitCount += 1;
      if (r.logged_at > existing.lastLoggedAt) existing.lastLoggedAt = r.logged_at;
    } else {
      map.set(r.station_id, {
        stationId: r.station_id,
        stationName: r.station_name,
        isEv,
        visitCount: 1,
        lastLoggedAt: r.logged_at,
      });
    }
  }

  const aggs = Array.from(map.values());
  const gasIds = aggs.filter((a) => !a.isEv).map((a) => a.stationId);
  const evIds = aggs.filter((a) => a.isEv).map((a) => a.stationId);

  // 좌표 배치 조회(주유소=stations, 충전소=ev_chargers). 두 테이블 모두 lat/lng 컬럼 보유.
  const coords = new Map<string, { lat: number; lng: number }>();

  if (gasIds.length > 0) {
    const { data: gas } = await sb.from('stations').select('id, lat, lng').in('id', gasIds);
    for (const g of (gas ?? []) as Array<{ id: string; lat: number | null; lng: number | null }>) {
      if (g.lat != null && g.lng != null) coords.set(g.id, { lat: g.lat, lng: g.lng });
    }
  }
  if (evIds.length > 0) {
    // ev_chargers는 (stat_id, chger_id) 복합키라 충전소당 여러 행 → 첫 좌표만 사용.
    const { data: ev } = await sb.from('ev_chargers').select('stat_id, lat, lng').in('stat_id', evIds);
    for (const e of (ev ?? []) as Array<{ stat_id: string; lat: number | null; lng: number | null }>) {
      if (e.lat != null && e.lng != null && !coords.has(e.stat_id)) {
        coords.set(e.stat_id, { lat: e.lat, lng: e.lng });
      }
    }
  }

  const stations: FuelLogStation[] = aggs
    .map((a) => {
      const c = coords.get(a.stationId);
      return {
        stationId: a.stationId,
        stationName: a.stationName,
        isEv: a.isEv,
        lat: c?.lat ?? null,
        lng: c?.lng ?? null,
        visitCount: a.visitCount,
        lastLoggedAt: a.lastLoggedAt,
      };
    })
    // 좌표 없는 곳은 지도에 못 찍으므로 제외(핀 전용 응답).
    .filter((s) => s.lat != null && s.lng != null)
    .sort((a, b) => b.visitCount - a.visitCount);

  return NextResponse.json({ stations });
}
