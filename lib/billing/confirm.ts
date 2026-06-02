// 결제 확정 공통 로직 (포트원 v2).
// /api/billing/complete (클라 콜백) 와 /api/billing/return (모바일 redirect) 이 공유한다.
//
// 신뢰원: billing_pending(oid → user_id, plan, mode, amount, status). 세션에 의존하지 않는다.
// 검증: 단건은 GET /payments 로 status=PAID + 금액 일치 확인. 정기는 빌링키 발급 확인.
// 멱등: pending.status === 'consumed' 면 재처리 없이 성공으로 간주.

import { getSupabase } from '@/lib/db/supabase';
import {
  PLAN,
  getPayment,
  getBillingKey,
  type PlanCode,
  type PgKind,
} from '@/lib/billing/portone';

export interface ConfirmInput {
  /** 단건: 결제 paymentId */
  paymentId?: string;
  /** 정기: 발급된 빌링키 */
  billingKey?: string;
  /** 정기: 발급 요청 시 issueId(= billing_pending.oid) */
  issueId?: string;
}

export type ConfirmResult =
  | { ok: true; plan: PlanCode; already?: boolean }
  | { ok: false; reason: string };

/**
 * billing_pending 을 신뢰원으로 단건/정기 결제를 확정하고 구독을 생성한다.
 * provider 컬럼은 'portone' 으로 기록. inicis_tid 컬럼은 포트원 paymentId/txId 재사용.
 */
export async function confirmPayment(input: ConfirmInput): Promise<ConfirmResult> {
  const sb = getSupabase();

  // 우리가 발급한 식별자(oid = paymentId 또는 issueId)인지로 신뢰원 조회.
  const oid = input.paymentId ?? input.issueId;
  if (!oid) return { ok: false, reason: 'missing_id' };

  const { data: pending } = await sb
    .from('billing_pending')
    .select('oid, user_id, plan, mode, amount, status')
    .eq('oid', oid)
    .maybeSingle();
  if (!pending) return { ok: false, reason: 'unknown_order' };

  const planDef = PLAN[pending.plan as PlanCode];
  if (!planDef) return { ok: false, reason: 'bad_plan' };

  // 멱등: 이미 소비된 주문은 재처리하지 않고 성공으로 본다.
  if (pending.status === 'consumed') {
    return { ok: true, plan: planDef.code, already: true };
  }

  const userId = pending.user_id;
  const now = new Date();
  const nowIso = now.toISOString();

  if (pending.mode === 'pay') {
    // ── 단건: GET /payments 로 상태·금액 재검증 ──
    if (!input.paymentId) return { ok: false, reason: 'missing_payment_id' };
    let payment;
    try {
      payment = await getPayment(input.paymentId);
    } catch (e) {
      console.error('[billing] getPayment 실패', e);
      return { ok: false, reason: 'verify_error' };
    }
    if (payment.status !== 'PAID') {
      await logEvent(userId, 'charge_fail', planDef.amount, oid, null, payment.raw);
      return { ok: false, reason: `status_${payment.status || 'unknown'}` };
    }
    const paid = payment.amount?.paid ?? payment.amount?.total;
    if (paid != null && paid !== planDef.amount) {
      await logEvent(userId, 'charge_fail', planDef.amount, oid, payment.pgTxId ?? null, payment.raw);
      return { ok: false, reason: 'amount_mismatch' };
    }

    await cleanupStaleSubs(userId);

    const expires = new Date(now.getTime() + PLAN.onetime_1000.periodDays * 86400000);
    const { data: sub, error } = await sb
      .from('subscriptions')
      .insert({
        user_id: userId,
        status: 'active',
        plan: planDef.code,
        plan_type: 'onetime',
        provider: 'portone',
        inicis_tid: payment.pgTxId ?? payment.id, // 포트원 paymentId/txId 재사용
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
      console.error('[billing] subscribe insert 실패', error);
      return { ok: false, reason: 'db' };
    }
    await logEvent(userId, 'charge_success', planDef.amount, oid, payment.pgTxId ?? null, payment.raw, sub.id);
  } else {
    // ── 정기: 빌링키 발급 확인 → trial 구독 생성(첫 청구는 charge-cron) ──
    if (!input.billingKey) return { ok: false, reason: 'missing_billing_key' };
    let info;
    try {
      info = await getBillingKey(input.billingKey);
    } catch (e) {
      console.error('[billing] getBillingKey 실패', e);
      return { ok: false, reason: 'verify_error' };
    }
    if (info.status !== 'ISSUED') {
      await logEvent(userId, 'charge_fail', 0, oid, null, info.raw);
      return { ok: false, reason: `billingkey_${info.status || 'unknown'}` };
    }

    await cleanupStaleSubs(userId);

    const trialEnd = new Date(now.getTime() + PLAN.monthly_1000.trialDays * 86400000);
    const { data: sub, error } = await sb
      .from('subscriptions')
      .insert({
        user_id: userId,
        status: 'trial',
        plan: planDef.code,
        plan_type: 'recurring',
        provider: 'portone',
        billing_key: input.billingKey,
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
      console.error('[billing] subscribe insert 실패', error);
      return { ok: false, reason: 'db' };
    }
    await logEvent(userId, 'subscribe', 0, oid, null, info.raw, sub.id);
  }

  await sb
    .from('billing_pending')
    .update({ status: 'consumed', consumed_at: nowIso })
    .eq('oid', oid);

  return { ok: true, plan: planDef.code };
}

/** active/trial 유니크 인덱스 회피: 만료/해지된 구독 정리 */
async function cleanupStaleSubs(userId: string) {
  const sb = getSupabase();
  await sb
    .from('subscriptions')
    .delete()
    .eq('user_id', userId)
    .in('status', ['expired', 'canceled', 'past_due']);
}

async function logEvent(
  userId: string,
  kind: string,
  amount: number,
  oid: string,
  tid: string | null,
  raw: Record<string, unknown>,
  subscriptionId?: string,
) {
  const sb = getSupabase();
  await sb.from('billing_events').insert({
    subscription_id: subscriptionId ?? null,
    user_id: userId,
    kind,
    provider: 'portone',
    amount,
    oid,
    tid,
    raw,
  });
}

/** channel 매핑 헬퍼 재노출용(타입만) */
export type { PgKind };
