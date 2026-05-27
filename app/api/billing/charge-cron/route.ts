// Vercel Cron (매시간) — trial 만료 또는 next_charge_at 도래한 구독을 결제
// Authorization: Bearer ${CRON_SECRET}

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { chargeWithBillingKey, PLAN } from '@/lib/billing/toss';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'supabase not configured' });
  }

  const sb = getSupabase();
  const nowIso = new Date().toISOString();

  // 결제 대상: status in (trial, active) AND next_charge_at <= now AND billing_key 있음
  const { data: due, error } = await sb
    .from('subscriptions')
    .select('id, user_id, billing_key, customer_key, status, next_charge_at')
    .in('status', ['trial', 'active'])
    .not('billing_key', 'is', null)
    .lte('next_charge_at', nowIso)
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const s of due ?? []) {
    const orderId = `1000n-${s.id.slice(0, 8)}-${Date.now()}`;
    try {
      const charge = await chargeWithBillingKey({
        billingKey: s.billing_key!,
        customerKey: s.customer_key,
        amount: PLAN.monthly_1000.amount,
        orderId,
        orderName: PLAN.monthly_1000.name,
      });

      const next = new Date(Date.now() + PLAN.monthly_1000.intervalDays * 86400000);
      await sb.from('subscriptions').update({
        status: 'active',
        last_payment_at: nowIso,
        current_period_start: nowIso,
        current_period_end: next.toISOString(),
        next_charge_at: next.toISOString(),
        fail_count: 0,
        updated_at: nowIso,
      }).eq('id', s.id);

      await sb.from('billing_events').insert({
        subscription_id: s.id, user_id: s.user_id,
        kind: 'charge_success',
        amount: PLAN.monthly_1000.amount,
        toss_payment_key: charge.paymentKey,
        toss_order_id: orderId,
        raw: charge as unknown as Record<string, unknown>,
      });
      results.push({ id: s.id, ok: true });
    } catch (e) {
      // 결제 실패 — fail_count 증가, 3회 이상이면 past_due
      const { data: cur } = await sb.from('subscriptions').select('fail_count').eq('id', s.id).single();
      const failCount = (cur?.fail_count ?? 0) + 1;
      const retry = new Date(Date.now() + 1 * 86400000); // 24h 후 재시도
      await sb.from('subscriptions').update({
        status: failCount >= 3 ? 'past_due' : s.status,
        fail_count: failCount,
        next_charge_at: failCount >= 3 ? null : retry.toISOString(),
        updated_at: nowIso,
      }).eq('id', s.id);

      await sb.from('billing_events').insert({
        subscription_id: s.id, user_id: s.user_id,
        kind: 'charge_fail',
        amount: PLAN.monthly_1000.amount,
        toss_order_id: orderId,
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
