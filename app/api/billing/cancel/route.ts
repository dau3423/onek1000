// 구독 해지.
// - 정기(빌링): 다음 결제 중단(next_charge_at/billing_key 제거). 현재 기간 종료일까지는 광고 OFF 유지.
// - 단건(만료형): 자동갱신이 없으므로 즉시 만료 처리 없이 만료일까지 유지(해지 개념 없음 → 그대로 만료).
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

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
    .select('id, plan_type, status')
    .eq('user_id', user.id)
    .in('status', ['trial', 'active'])
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: 'no active subscription' }, { status: 404 });

  // 단건은 자동갱신이 없으니 별도 청구 중단이 불필요. 사용자 요청을 해지로 기록만.
  await sb
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      next_charge_at: null,
      billing_key: null,
    })
    .eq('id', sub.id);

  await sb.from('billing_events').insert({
    subscription_id: sub.id, user_id: user.id, kind: 'cancel', provider: 'inicis', amount: 0,
  });

  return NextResponse.json({ ok: true });
}
