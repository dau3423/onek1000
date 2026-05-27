// 클라이언트에서 토스 인증창을 통과해 authKey를 받아 호출.
// 1) authKey → billingKey 발급
// 2) subscriptions 행을 trial(7일)로 생성 — 즉시 결제는 trial 종료 시점에 cron이 처리

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { issueBillingKey, PLAN } from '@/lib/billing/toss';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { authKey, customerKey } = (await req.json()) as { authKey?: string; customerKey?: string };
  if (!authKey || !customerKey) {
    return NextResponse.json({ error: 'authKey and customerKey are required' }, { status: 400 });
  }

  const sb = getSupabase();
  const { data: user, error: userErr } = await sb
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (userErr || !user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // 이미 active/trial 구독이 있으면 차단 (DB 유니크 인덱스도 보호 중)
  const { data: existing } = await sb
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['trial', 'active'])
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'already subscribed' }, { status: 409 });

  // billingKey 발급
  let billing;
  try {
    billing = await issueBillingKey({ authKey, customerKey });
  } catch (e) {
    return NextResponse.json({ error: 'billing key issue failed', detail: String(e) }, { status: 502 });
  }

  const now = new Date();
  const trialEnd = new Date(now.getTime() + PLAN.monthly_1000.trialDays * 86400000);

  const { data: sub, error: insErr } = await sb
    .from('subscriptions')
    .insert({
      user_id: user.id,
      status: 'trial',
      plan: PLAN.monthly_1000.code,
      billing_key: billing.billingKey,
      customer_key: customerKey,
      trial_end: trialEnd.toISOString(),
      next_charge_at: trialEnd.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
    })
    .select()
    .single();
  if (insErr || !sub) {
    return NextResponse.json({ error: 'subscribe insert failed', detail: insErr?.message }, { status: 500 });
  }

  await sb.from('billing_events').insert({
    subscription_id: sub.id, user_id: user.id, kind: 'subscribe',
    amount: 0, raw: { card: billing.card },
  });

  return NextResponse.json({
    ok: true,
    subscription: {
      id: sub.id, status: sub.status,
      trialEnd: trialEnd.toISOString(),
    },
  });
}
