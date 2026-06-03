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

interface FuelLogRow {
  id: string;
  station_id: string;
  station_name: string;
  product: string;
  unit_price: number | null;
  amount_won: number | null;
  liters: number | string | null;
  odometer: number | null;
  memo: string | null;
  logged_at: string;
  created_at: string;
}

function toFuelLog(r: FuelLogRow): FuelLog {
  return {
    id: r.id,
    stationId: r.station_id,
    stationName: r.station_name,
    product: (r.product as ProductCode) in PRODUCT_LABEL ? (r.product as ProductCode) : 'B027',
    unitPrice: r.unit_price,
    amountWon: r.amount_won,
    liters: r.liters === null ? null : Number(r.liters),
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
    .select('id, station_id, station_name, product, unit_price, amount_won, liters, odometer, memo, logged_at, created_at')
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

  const { stationId } = (await req.json()) as { stationId?: string };
  if (!stationId) return NextResponse.json({ error: 'stationId required' }, { status: 400 });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const sb = getSupabase();

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
  const unitPrice: number | null = priceRow?.price ?? null;

  const { data, error } = await sb
    .from('fuel_logs')
    .insert({
      user_id: userId,
      station_id: stationId,
      station_name: station.name as string,
      product,
      unit_price: unitPrice,
    })
    .select('id, station_id, station_name, product, unit_price, amount_won, liters, odometer, memo, logged_at, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: '저장에 실패했어요.' }, { status: 500 });

  return NextResponse.json({ log: toFuelLog(data as FuelLogRow) });
}
