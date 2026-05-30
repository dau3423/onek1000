// 관심 지역 CRUD — 로그인 필요
// "집/회사" 같은 고정 좌표를 등록해두면 cron이 반경 내 최저가 변동을 푸시로 알린다.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import {
  INTEREST_REGION_MAX,
  INTEREST_REGION_DEFAULT_RADIUS_M,
  type InterestRegion,
} from '@/types/interest-region';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';

export const runtime = 'nodejs';

async function getUserId(email: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  return data?.id ?? null;
}

interface RegionRow {
  id: string; name: string; lat: number; lng: number;
  radius_m: number; product: string; created_at: string;
}

function toRegion(r: RegionRow): InterestRegion {
  return {
    id: r.id, name: r.name, lat: r.lat, lng: r.lng,
    radiusM: r.radius_m, product: (r.product as ProductCode) ?? 'B027',
    createdAt: r.created_at,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ regions: [] });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ regions: [] });

  const sb = getSupabase();
  const { data } = await sb
    .from('interest_regions')
    .select('id, name, lat, lng, radius_m, product, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return NextResponse.json({ regions: (data ?? []).map((r) => toRegion(r as RegionRow)) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const body = await req.json() as {
    name?: string; lat?: number; lng?: number; radiusM?: number; product?: string;
  };
  const name = body.name?.trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!name || name.length > 20) return NextResponse.json({ error: '이름을 1~20자로 입력해 주세요.' }, { status: 400 });
  if (!Number.isFinite(lat) || lat < 33 || lat > 39) return NextResponse.json({ error: 'lat 범위 오류' }, { status: 400 });
  if (!Number.isFinite(lng) || lng < 124 || lng > 132) return NextResponse.json({ error: 'lng 범위 오류' }, { status: 400 });

  const radiusM = Number.isFinite(Number(body.radiusM))
    ? Math.min(Math.max(Math.round(Number(body.radiusM)), 500), 20000)
    : INTEREST_REGION_DEFAULT_RADIUS_M;
  const product: ProductCode = (body.product && body.product in PRODUCT_LABEL)
    ? (body.product as ProductCode) : 'B027';

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const sb = getSupabase();
  // 개수 제한 사전 검증 (DB 트리거가 최종 방어)
  const { count } = await sb
    .from('interest_regions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if ((count ?? 0) >= INTEREST_REGION_MAX) {
    return NextResponse.json({ error: `관심 지역은 최대 ${INTEREST_REGION_MAX}개까지 등록할 수 있어요.` }, { status: 409 });
  }

  const { data, error } = await sb
    .from('interest_regions')
    .insert({ user_id: userId, name, lat, lng, radius_m: radiusM, product })
    .select('id, name, lat, lng, radius_m, product, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: '등록에 실패했어요.' }, { status: 500 });

  return NextResponse.json({ region: toRegion(data as RegionRow) });
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
  await sb.from('interest_regions').delete().eq('id', id).eq('user_id', userId);
  return NextResponse.json({ ok: true });
}
