// KG이니시스 표준결제창 returnUrl 수신 엔드포인트.
// 결제창이 인증 완료 후 이 URL로 form-urlencoded(POST) 결과를 보낸다.
// 여기서 서버 승인요청(S2S)으로 최종 확정한 뒤, 결과 페이지로 303 리다이렉트한다.
// (returnUrl 파라미터는 위변조 가능 → authToken/authUrl 기반 승인요청으로만 확정)
//
// 단건(onetime): 승인 성공 시 1개월 만료 구독 생성(자동갱신 없음).
// 정기(monthly): 빌링키(CARD_BillKey) 발급 → trial(7일) 구독, charge-cron이 첫 청구.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { approve, PLAN, type StdPayReturn, type PlanCode } from '@/lib/billing/inicis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirectTo(req: Request, path: string): NextResponse {
  const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  return NextResponse.redirect(new URL(path, origin), 303);
}

export async function POST(req: Request) {
  // 결제창 결과 파싱(form-urlencoded)
  let form: Record<string, string> = {};
  try {
    const fd = await req.formData();
    form = Object.fromEntries(Array.from(fd.entries()).map(([k, v]) => [k, String(v)]));
  } catch {
    return redirectTo(req, '/billing/fail?reason=parse');
  }

  const ret: StdPayReturn = {
    resultCode: form.resultCode ?? '',
    resultMsg: form.resultMsg,
    mid: form.mid ?? '',
    orderNumber: form.orderNumber ?? '',
    authToken: form.authToken ?? '',
    authUrl: form.authUrl ?? '',
    netCancelUrl: form.netCancelUrl,
    idc_name: form.idc_name,
    charset: form.charset,
  };

  // 인증 단계 실패(사용자 취소 등)
  if (ret.resultCode && ret.resultCode !== '0000') {
    return redirectTo(req, `/billing/fail?reason=${encodeURIComponent(ret.resultMsg || ret.resultCode)}`);
  }
  if (!ret.authToken || !ret.authUrl || !ret.mid || !ret.orderNumber) {
    return redirectTo(req, '/billing/fail?reason=missing');
  }

  if (!isSupabaseConfigured()) {
    return redirectTo(req, '/billing/fail?reason=unconfigured');
  }

  // returnUrl POST는 KG이니시스 도메인 → 우리 도메인 cross-site POST라
  // NextAuth 세션 쿠키(SameSite=Lax)가 실리지 않는다. 따라서 세션이 아니라
  // subscribe 시점에 서버가 발급·기록한 billing_pending(oid → user_id)을
  // 사용자 식별의 신뢰원으로 사용한다. 최종 확정은 아래 authToken 기반
  // S2S 승인요청으로 검증한다.
  const sb = getSupabase();

  // 우리가 발급한 주문인지 검증 + 중복 처리 방지
  const oid = ret.orderNumber;
  const { data: pending } = await sb
    .from('billing_pending')
    .select('oid, user_id, plan, mode, amount, status')
    .eq('oid', oid)
    .maybeSingle();
  if (!pending) return redirectTo(req, '/billing/fail?reason=unknown_order');
  if (pending.status === 'consumed') {
    return redirectTo(req, '/billing/success?status=ok&plan=' + pending.plan);
  }

  // 이후 모든 user 식별은 billing_pending의 user_id를 신뢰원으로 사용한다.
  const userId = pending.user_id;

  const planDef = PLAN[pending.plan as PlanCode];
  if (!planDef) return redirectTo(req, '/billing/fail?reason=bad_plan');

  // ── 서버 승인요청(S2S) ──
  let approval;
  try {
    approval = await approve(ret);
  } catch (e) {
    console.error('inicis approve error', e);
    return redirectTo(req, '/billing/fail?reason=approve_error');
  }
  if (!approval.ok) {
    await sb.from('billing_events').insert({
      user_id: userId, kind: 'charge_fail', provider: 'inicis',
      amount: pending.amount, oid, tid: approval.tid ?? null,
      raw: approval.raw as Record<string, unknown>,
    });
    return redirectTo(req, `/billing/fail?reason=${encodeURIComponent(approval.resultCode)}`);
  }

  if (pending.mode === 'billing' && !approval.billKey) {
    return redirectTo(req, '/billing/fail?reason=no_billkey');
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // 기존 만료/해지 구독 정리(active/trial 유니크 인덱스 회피)
  await sb
    .from('subscriptions')
    .delete()
    .eq('user_id', userId)
    .in('status', ['expired', 'canceled', 'past_due']);

  if (pending.mode === 'pay') {
    const expires = new Date(now.getTime() + PLAN.onetime_1000.periodDays * 86400000);
    const { data: sub, error } = await sb
      .from('subscriptions')
      .insert({
        user_id: userId,
        status: 'active',
        plan: planDef.code,
        plan_type: 'onetime',
        provider: 'inicis',
        inicis_tid: approval.tid ?? null,
        customer_key: oid,
        current_period_start: nowIso,
        current_period_end: expires.toISOString(),
        expires_at: expires.toISOString(),
        last_payment_at: nowIso,
        next_charge_at: null,
        updated_at: nowIso,
      })
      .select('id')
      .single();
    if (error || !sub) {
      console.error('subscribe insert failed', error);
      return redirectTo(req, '/billing/fail?reason=db');
    }
    await sb.from('billing_events').insert({
      subscription_id: sub.id, user_id: userId, kind: 'charge_success', provider: 'inicis',
      amount: planDef.amount, oid, tid: approval.tid ?? null,
      raw: approval.raw as Record<string, unknown>,
    });
  } else {
    const trialEnd = new Date(now.getTime() + PLAN.monthly_1000.trialDays * 86400000);
    const { data: sub, error } = await sb
      .from('subscriptions')
      .insert({
        user_id: userId,
        status: 'trial',
        plan: planDef.code,
        plan_type: 'recurring',
        provider: 'inicis',
        billing_key: approval.billKey,
        inicis_tid: approval.tid ?? null,
        customer_key: oid,
        trial_end: trialEnd.toISOString(),
        next_charge_at: trialEnd.toISOString(),
        current_period_start: nowIso,
        current_period_end: trialEnd.toISOString(),
        updated_at: nowIso,
      })
      .select('id')
      .single();
    if (error || !sub) {
      console.error('subscribe insert failed', error);
      return redirectTo(req, '/billing/fail?reason=db');
    }
    await sb.from('billing_events').insert({
      subscription_id: sub.id, user_id: userId, kind: 'subscribe', provider: 'inicis',
      amount: 0, oid, tid: approval.tid ?? null,
      raw: approval.raw as Record<string, unknown>,
    });
  }

  await sb
    .from('billing_pending')
    .update({ status: 'consumed', consumed_at: nowIso })
    .eq('oid', oid);

  return redirectTo(req, `/billing/success?status=ok&plan=${planDef.code}`);
}
