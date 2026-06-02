// Cron(매시간) — trial 만료 또는 next_charge_at 도래한 "정기(빌링)" 구독을 포트원 v2 빌링키 결제로 청구.
// 단건(onetime, billing_key 없음)은 대상이 아니다(만료 시 자연 expire).
// Authorization: Bearer ${CRON_SECRET}
//
// 빌링키 결제: POST /payments/{paymentId}/billing-key. 채널은 빌링키 자체로 결정되므로 channelKey 생략.
// 기존 trial/past_due/재시도(3회) 로직 그대로 유지. tid 는 inicis_tid 컬럼 재사용(포트원 paymentId/txId).

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { payWithBillingKey, isPortoneConfigured, PLAN, makePaymentId } from '@/lib/billing/portone';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'supabase not configured' });
  }
  if (!isPortoneConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'portone not configured' });
  }

  const sb = getSupabase();
  const now = new Date();
  const nowIso = now.toISOString();

  // 1) 단건(onetime) 만료 처리: 결제 없이 expired 마킹
  await sb
    .from('subscriptions')
    .update({ status: 'expired', updated_at: nowIso })
    .eq('plan_type', 'onetime')
    .eq('status', 'active')
    .lte('expires_at', nowIso);

  // 2) 정기(빌링) 청구 대상: status in (trial, active) AND billing_key 존재 AND next_charge_at <= now
  const { data: due, error } = await sb
    .from('subscriptions')
    .select('id, user_id, billing_key, status, fail_count')
    .eq('plan_type', 'recurring')
    .in('status', ['trial', 'active'])
    .not('billing_key', 'is', null)
    .lte('next_charge_at', nowIso)
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const plan = PLAN.monthly_1000;

  for (const s of due ?? []) {
    const paymentId = makePaymentId('rc');
    // 구매자 정보(이메일) — 영수증/식별용
    const { data: u } = await sb
      .from('users')
      .select('email, nickname, name')
      .eq('id', s.user_id)
      .maybeSingle();
    try {
      const charge = await payWithBillingKey({
        paymentId,
        billingKey: s.billing_key!,
        amount: plan.amount,
        orderName: plan.name,
        customer: {
          id: String(s.user_id),
          email: (u?.email as string) || undefined,
          name: (u?.nickname as string) || (u?.name as string) || '1000냥 회원',
        },
      });

      if (!charge.ok) throw new Error(`${charge.message ?? ''} (${charge.status ?? 'fail'})`);

      const next = new Date(now.getTime() + plan.intervalDays * 86400000);
      await sb
        .from('subscriptions')
        .update({
          status: 'active',
          inicis_tid: charge.pgTxId ?? charge.paymentId, // 포트원 paymentId/txId 재사용
          last_payment_at: nowIso,
          current_period_start: nowIso,
          current_period_end: next.toISOString(),
          next_charge_at: next.toISOString(),
          fail_count: 0,
          updated_at: nowIso,
        })
        .eq('id', s.id);

      await sb.from('billing_events').insert({
        subscription_id: s.id,
        user_id: s.user_id,
        kind: 'charge_success',
        provider: 'portone',
        amount: plan.amount,
        oid: paymentId,
        tid: charge.pgTxId ?? charge.paymentId,
        raw: charge.raw as Record<string, unknown>,
      });
      results.push({ id: s.id, ok: true });
    } catch (e) {
      const failCount = (s.fail_count ?? 0) + 1;
      const retry = new Date(now.getTime() + 86400000); // 24h 후 재시도
      await sb
        .from('subscriptions')
        .update({
          status: failCount >= 3 ? 'past_due' : s.status,
          fail_count: failCount,
          next_charge_at: failCount >= 3 ? null : retry.toISOString(),
          updated_at: nowIso,
        })
        .eq('id', s.id);

      await sb.from('billing_events').insert({
        subscription_id: s.id,
        user_id: s.user_id,
        kind: 'charge_fail',
        provider: 'portone',
        amount: plan.amount,
        oid: paymentId,
        raw: { error: String(e) },
      });
      results.push({ id: s.id, ok: false, error: String(e) });
    }
  }

  return NextResponse.json({
    runId: randomUUID(),
    processed: results.length,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    details: results,
  });
}
