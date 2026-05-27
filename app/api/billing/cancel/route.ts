// 사용자가 구독 해지. 현재 기간(period_end)까지는 광고 OFF 유지.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { deleteBillingKey } from '@/lib/billing/toss';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const sb = getSupabase();
  const { data: user } = await sb.from('users').select('id').eq('email', session.user.email).maybeSingle();
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const { data: sub } = await sb
    .from('subscriptions')
    .select('id, billing_key, status')
    .eq('user_id', user.id)
    .in('status', ['trial', 'active'])
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: 'no active subscription' }, { status: 404 });

  // 토스 빌링키 삭제 (실패해도 진행 — 다음 결제 시점에 자체 차단)
  if (sub.billing_key) {
    try { await deleteBillingKey(sub.billing_key); } catch (e) { console.warn('toss delete fail', e); }
  }

  await sb.from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      next_charge_at: null,
      billing_key: null,
    })
    .eq('id', sub.id);

  await sb.from('billing_events').insert({
    subscription_id: sub.id, user_id: user.id, kind: 'cancel', amount: 0,
  });

  return NextResponse.json({ ok: true });
}
