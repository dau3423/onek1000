// 클라이언트 complete 콜백 (포트원 v2 — PC/모바일 SDK 성공 시 호출).
// 단건: { paymentId } / 정기: { billingKey, issueId } 수신.
// billing_pending(oid) 을 신뢰원으로, 단건은 GET /payments, 정기는 빌링키 발급을
// 서버에서 재검증한 뒤 구독을 확정한다(멱등). 세션에 의존하지 않는다.

import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { isPortoneConfigured } from '@/lib/billing/portone';
import { confirmPayment } from '@/lib/billing/confirm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  if (!isPortoneConfigured()) {
    return NextResponse.json({ error: 'PortOne not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    paymentId?: string;
    billingKey?: string;
    issueId?: string;
  };

  const result = await confirmPayment({
    paymentId: body.paymentId,
    billingKey: body.billingKey,
    issueId: body.issueId,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, plan: result.plan, already: result.already ?? false });
}
