// 내 주유 기록 CRUD — 로그인 필요, 소유자 스코프
// POST: 1클릭 생성. body 최소 {stationId} + 서버가 단가/유종/시각을 보강해 즉시 저장.
//   단가는 클라이언트 값을 신뢰하지 않고 우리 DB(prices_latest)에서 조회(없으면 null).
// GET: 내 기록 목록(최신순, 페이지네이션).
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getDefaultProduct } from '@/lib/auth/session';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import type { FuelLog } from '@/types/fuel-log';

export const runtime = 'nodejs';

const PAGE_SIZE = 20;

async function getUserId(email: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  return data?.id ?? null;
}

// 주유/충전 기록 공용 컬럼 셀렉트(GET/POST 공통).
const SELECT_COLS =
  'id, kind, station_id, station_name, product, unit_price, amount_won, liters, kwh, odometer, memo, logged_at, created_at';

interface FuelLogRow {
  id: string;
  kind: string | null;
  station_id: string;
  station_name: string;
  product: string;
  unit_price: number | null;
  amount_won: number | null;
  liters: number | string | null;
  kwh: number | string | null;
  odometer: number | null;
  memo: string | null;
  logged_at: string;
  created_at: string;
}

function toFuelLog(r: FuelLogRow): FuelLog {
  return {
    id: r.id,
    kind: r.kind === 'ev' ? 'ev' : 'gas',
    stationId: r.station_id,
    stationName: r.station_name,
    product: (r.product as ProductCode) in PRODUCT_LABEL ? (r.product as ProductCode) : 'B027',
    unitPrice: r.unit_price,
    amountWon: r.amount_won,
    liters: r.liters === null ? null : Number(r.liters),
    kwh: r.kwh === null ? null : Number(r.kwh),
    odometer: r.odometer,
    memo: r.memo,
    loggedAt: r.logged_at,
    createdAt: r.created_at,
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ logs: [], hasMore: false });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ logs: [], hasMore: false });

  const page = Math.max(0, Number(new URL(req.url).searchParams.get('page') ?? '0') || 0);
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE; // 1건 더 받아 다음 페이지 존재 여부 판단

  const sb = getSupabase();
  const { data } = await sb
    .from('fuel_logs')
    .select(SELECT_COLS)
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .range(from, to);

  const rows = (data ?? []) as FuelLogRow[];
  const hasMore = rows.length > PAGE_SIZE;
  const logs = rows.slice(0, PAGE_SIZE).map(toFuelLog);
  return NextResponse.json({ logs, hasMore });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const body = (await req.json()) as { stationId?: string; kind?: string };
  const stationId = body.stationId;
  if (!stationId) return NextResponse.json({ error: 'stationId required' }, { status: 400 });
  const kind: 'gas' | 'ev' = body.kind === 'ev' ? 'ev' : 'gas';

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const sb = getSupabase();

  // 저장할 행(공통 컬럼). kind별로 station_name/product/unit_price를 서버에서 보강한다.
  let insertRow: {
    user_id: string;
    station_id: string;
    station_name: string;
    product: string;
    unit_price: number | null;
    kind: 'gas' | 'ev';
  };

  if (kind === 'ev') {
    // 충전소 존재/명칭 확인(스냅샷). 클라가 보낸 statId를 신뢰하지 않고 ev_chargers에서 확인한다.
    const { data: charger } = await sb
      .from('ev_chargers')
      .select('stat_id, stat_nm')
      .eq('stat_id', stationId)
      .eq('del_yn', false)
      .limit(1)
      .maybeSingle();
    if (!charger) return NextResponse.json({ error: 'station not found' }, { status: 404 });

    // EV는 유종 개념이 없어 product는 'EV' placeholder. 단가(원/kWh)는 우리 DB에 없어 null(나중 편집).
    insertRow = {
      user_id: userId,
      station_id: stationId,
      station_name: (charger.stat_nm as string) ?? '전기차 충전소',
      product: 'EV',
      unit_price: null,
      kind: 'ev',
    };
  } else {
    // 주유소 존재/상호 확인(스냅샷 저장용)
    const { data: station } = await sb
      .from('stations')
      .select('id, name')
      .eq('id', stationId)
      .maybeSingle();
    if (!station) return NextResponse.json({ error: 'station not found' }, { status: 404 });

    // 유종: 내 기본 차량 유종(없으면 휘발유 B027)
    const product = (await getDefaultProduct(userId)) ?? 'B027';

    // 단가: 우리 DB 현재가를 서버에서 조회(클라 값 신뢰 금지). 없으면 null.
    const { data: priceRow } = await sb
      .from('prices_latest')
      .select('price')
      .eq('station_id', stationId)
      .eq('product', product)
      .maybeSingle();

    insertRow = {
      user_id: userId,
      station_id: stationId,
      station_name: station.name as string,
      product,
      unit_price: priceRow?.price ?? null,
      kind: 'gas',
    };
  }

  const { data, error } = await sb
    .from('fuel_logs')
    .insert(insertRow)
    .select(SELECT_COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: '저장에 실패했어요.' }, { status: 500 });

  return NextResponse.json({ log: toFuelLog(data as FuelLogRow) });
}
