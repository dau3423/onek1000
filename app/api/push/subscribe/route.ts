// 푸시 구독/해지 — 유료(isPremium) 사용자만 등록 가능
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!session.user.isPremium) return NextResponse.json({ error: 'premium only' }, { status: 402 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const body = await req.json() as {
    endpoint?: string; keys?: { p256dh?: string; auth?: string }; userAgent?: string;
  };
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  }

  const sb = getSupabase();
  const { data: user } = await sb.from('users').select('id').eq('email', session.user.email).maybeSingle();
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  await sb.from('push_subscriptions').upsert({
    user_id: user.id, endpoint, p256dh, auth, user_agent: body.userAgent ?? null,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 });

  const sb = getSupabase();
  const { data: user } = await sb.from('users').select('id').eq('email', session.user.email).maybeSingle();
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  await sb.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
