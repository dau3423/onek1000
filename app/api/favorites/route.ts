// 즐겨찾기 CRUD — 로그인 필요
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

export const runtime = 'nodejs';

async function getUserId(email: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  return data?.id ?? null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ stations: [] });

  const sb = getSupabase();
  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ stations: [] });

  const { data } = await sb
    .from('favorites')
    .select('station_id, created_at, stations(id, name, brand_code)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return NextResponse.json({ favorites: data ?? [] });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const { stationId } = await req.json() as { stationId?: string };
  if (!stationId) return NextResponse.json({ error: 'stationId required' }, { status: 400 });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const sb = getSupabase();
  await sb.from('favorites').upsert({ user_id: userId, station_id: stationId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const url = new URL(req.url);
  const stationId = url.searchParams.get('stationId');
  if (!stationId) return NextResponse.json({ error: 'stationId required' }, { status: 400 });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const sb = getSupabase();
  await sb.from('favorites').delete().eq('user_id', userId).eq('station_id', stationId);
  return NextResponse.json({ ok: true });
}
