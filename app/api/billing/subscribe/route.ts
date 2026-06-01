// 결제창 시작 — 단건/정기 공통 진입점.
// 클라이언트가 plan을 보내면, 서버가 oid 발급 + billing_pending 기록 후
// KG이니시스 표준결제창에 넘길 폼 필드를 반환한다.
// (실제 결제 확정은 returnUrl → /api/billing/confirm 의 서버 승인요청에서 이뤄진다)

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { PLAN, buildStdPayFields, makeOid, type PlanCode } from '@/lib/billing/inicis';

export const runtime = 'nodejs';

const STDPAY_ACTION = 'https://stdpay.inicis.com/stdjs/INIStdPay.js';

function baseUrl(req: Request): string {
  return process.env.NEXTAUTH_URL || new URL(req.url).origin;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { plan } = (await req.json().catch(() => ({}))) as { plan?: string };
  if (plan !== 'onetime_1000' && plan !== 'monthly_1000') {
    return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
  }
  const planDef = PLAN[plan as PlanCode];

  const sb = getSupabase();
  const { data: user } = await sb
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // 이미 active/trial 구독이 있으면 차단
  const { data: existing } = await sb
    .from('subscriptions')
    .select('id, expires_at, current_period_end, trial_end')
    .eq('user_id', user.id)
    .in('status', ['trial', 'active'])
    .maybeSingle();
  if (existing) {
    const end = existing.expires_at || existing.current_period_end || existing.trial_end;
    if (!end || new Date(end).getTime() > Date.now()) {
      return NextResponse.json({ error: 'already subscribed' }, { status: 409 });
    }
  }

  const mode = planDef.recurring ? 'billing' : 'pay';
  const oid = makeOid(plan === 'onetime_1000' ? 'OT' : 'MO');

  const { error: penErr } = await sb.from('billing_pending').insert({
    oid,
    user_id: user.id,
    plan,
    mode,
    amount: planDef.amount,
    status: 'created',
  });
  if (penErr) {
    return NextResponse.json({ error: 'pending insert failed', detail: penErr.message }, { status: 500 });
  }

  const origin = baseUrl(req);
  const fields = buildStdPayFields({
    mode,
    oid,
    price: planDef.amount,
    goodname: planDef.name,
    buyeremail: session.user.email ?? '',
    buyername: session.user.nickname || session.user.name || '1000냥 회원',
    returnUrl: `${origin}/api/billing/return`,
    closeUrl: `${origin}/billing/fail`,
  });

  return NextResponse.json({ ok: true, scriptUrl: STDPAY_ACTION, fields });
}
