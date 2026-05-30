// 차량(연료 종류) CRUD — 로그인 필요, 소유자 스코프
// 기본 차량의 유종이 앱의 기본 유종으로 자동 선택된다.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { VEHICLE_MAX, type Vehicle } from '@/types/vehicle';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';

export const runtime = 'nodejs';

async function getUserId(email: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  return data?.id ?? null;
}

interface VehicleRow {
  id: string; name: string; fuel: string; is_default: boolean; created_at: string;
}

function toVehicle(r: VehicleRow): Vehicle {
  return {
    id: r.id, name: r.name,
    fuel: (r.fuel as ProductCode) in PRODUCT_LABEL ? (r.fuel as ProductCode) : 'B027',
    isDefault: r.is_default, createdAt: r.created_at,
  };
}

function parseFuel(v: unknown): ProductCode {
  return typeof v === 'string' && v in PRODUCT_LABEL ? (v as ProductCode) : 'B027';
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ vehicles: [] });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ vehicles: [] });

  const sb = getSupabase();
  const { data } = await sb
    .from('vehicles')
    .select('id, name, fuel, is_default, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return NextResponse.json({ vehicles: (data ?? []).map((r) => toVehicle(r as VehicleRow)) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const body = await req.json() as { name?: string; fuel?: string; isDefault?: boolean };
  const name = body.name?.trim();
  if (!name || name.length > 20) {
    return NextResponse.json({ error: '차량 이름을 1~20자로 입력해 주세요.' }, { status: 400 });
  }
  const fuel = parseFuel(body.fuel);

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const sb = getSupabase();
  // 개수 제한 사전 검증 (DB 트리거가 최종 방어)
  const { count } = await sb
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const total = count ?? 0;
  if (total >= VEHICLE_MAX) {
    return NextResponse.json({ error: `차량은 최대 ${VEHICLE_MAX}대까지 등록할 수 있어요.` }, { status: 409 });
  }

  // 첫 차량이거나 명시적으로 기본 지정 시 기본 차량으로
  const makeDefault = total === 0 || body.isDefault === true;
  if (makeDefault) {
    await sb.from('vehicles').update({ is_default: false }).eq('user_id', userId);
  }

  const { data, error } = await sb
    .from('vehicles')
    .insert({ user_id: userId, name, fuel, is_default: makeDefault })
    .select('id, name, fuel, is_default, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: '등록에 실패했어요.' }, { status: 500 });

  return NextResponse.json({ vehicle: toVehicle(data as VehicleRow) });
}

// 기본 차량 지정
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const body = await req.json() as { id?: string };
  const id = body.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const sb = getSupabase();
  // 소유자 스코프 검증
  const { data: owned } = await sb
    .from('vehicles').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await sb.from('vehicles').update({ is_default: false }).eq('user_id', userId);
  await sb.from('vehicles').update({ is_default: true }).eq('id', id).eq('user_id', userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const sb = getSupabase();
  const { data: target } = await sb
    .from('vehicles').select('is_default').eq('id', id).eq('user_id', userId).maybeSingle();
  await sb.from('vehicles').delete().eq('id', id).eq('user_id', userId);

  // 기본 차량을 삭제했다면 남은 차량 중 가장 오래된 것을 기본으로 승격
  if (target?.is_default) {
    const { data: next } = await sb
      .from('vehicles').select('id').eq('user_id', userId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (next) await sb.from('vehicles').update({ is_default: true }).eq('id', next.id);
  }
  return NextResponse.json({ ok: true });
}
