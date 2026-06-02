// 결제창 시작 — 단건/정기 공통 진입점 (포트원 v2).
// 클라이언트가 plan + pg를 보내면, 서버가 paymentId(단건)/issueId(정기)를 발급하고
// billing_pending에 기록한 뒤, 클라 결제창에 넘길 storeId/channelKey와 식별자를 반환한다.
// (실제 결제 확정은 /api/billing/complete 의 GET /payments 재검증에서 이뤄진다)

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import {
  PLAN,
  getPublicConfig,
  isPortoneConfigured,
  makePaymentId,
  makeIssueId,
  type PlanCode,
  type PgKind,
} from '@/lib/billing/portone';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  // 포트원 미설정 시 결제 미진입(Mock 회귀 없음).
  if (!isPortoneConfigured()) {
    return NextResponse.json({ error: 'PortOne not configured' }, { status: 503 });
  }

  const { plan, pg } = (await req.json().catch(() => ({}))) as { plan?: string; pg?: string };
  if (plan !== 'onetime_1000' && plan !== 'monthly_1000') {
    return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
  }
  if (pg !== 'inicis' && pg !== 'kakaopay') {
    return NextResponse.json({ error: 'invalid pg' }, { status: 400 });
  }
  const planDef = PLAN[plan as PlanCode];
  const pgKind = pg as PgKind;

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

  // 단건=pay(paymentId) / 정기=billing(issueId). oid 컬럼에 해당 식별자를 저장(신뢰원).
  const recurring = planDef.recurring;
  const mode = recurring ? 'billing' : 'pay';
  const merchantUid = recurring
    ? makeIssueId(plan === 'monthly_1000' ? 'mo' : 'bill')
    : makePaymentId(plan === 'onetime_1000' ? 'ot' : 'pay');

  const { error: penErr } = await sb.from('billing_pending').insert({
    oid: merchantUid,
    user_id: user.id,
    plan,
    mode,
    amount: planDef.amount,
    status: 'created',
  });
  if (penErr) {
    return NextResponse.json(
      { error: 'pending insert failed', detail: penErr.message },
      { status: 500 },
    );
  }

  const { storeId, channelKey } = getPublicConfig(pgKind, recurring);

  return NextResponse.json({
    ok: true,
    recurring,
    storeId,
    channelKey,
    // 단건이면 paymentId, 정기면 issueId 로 사용한다.
    paymentId: recurring ? undefined : merchantUid,
    issueId: recurring ? merchantUid : undefined,
    orderName: planDef.name,
    amount: planDef.amount,
    customer: {
      email: session.user.email ?? '',
      name: session.user.nickname || session.user.name || '1000냥 회원',
    },
  });
}
