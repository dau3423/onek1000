// 포트원 v2 웹훅 수신.
// 1) Standard Webhooks HMAC 서명 검증(PORTONE_WEBHOOK_SECRET). 미설정 시 검증 스킵+로깅.
// 2) 페이로드의 금액/상태는 신뢰하지 않고, paymentId 로 GET /payments 재조회해 확정(멱등).
//    - 단건 결제 완료(Transaction.Paid)면 confirmPayment 로 구독 생성/확정.
//    - 그 외 이벤트는 billing_events 로깅만.
// returnUrl/complete 가 이미 처리했더라도 멱등(billing_pending consumed)이라 중복 확정되지 않는다.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import {
  getPayment,
  isPortoneConfigured,
  verifyWebhook,
  isWebhookSecretConfigured,
} from '@/lib/billing/portone';
import { confirmPayment } from '@/lib/billing/confirm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // 검증을 위해 raw 본문을 그대로 읽는다(파싱 전).
  const rawBody = await req.text();

  // 1) 서명 검증
  const verify = verifyWebhook(rawBody, {
    id: req.headers.get('webhook-id'),
    timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature'),
  });
  if (!verify.skipped && !verify.verified) {
    console.warn('[billing/webhook] 서명 검증 실패', verify.reason);
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  if (verify.skipped && isWebhookSecretConfigured() === false) {
    console.warn('[billing/webhook] PORTONE_WEBHOOK_SECRET 미설정 — 서명검증 스킵, GET 재검증만 수행');
  }

  // 2) 페이로드 파싱(식별자 추출용으로만 사용 — 금액/상태는 신뢰하지 않음)
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, mock: true });
  }

  const sb = getSupabase();
  const data = (payload.data as Record<string, unknown> | undefined) ?? {};
  const type = String(payload.type ?? '');
  const paymentId = data.paymentId ? String(data.paymentId) : undefined;

  // 로깅(원장)
  await sb.from('billing_events').insert({
    kind: 'webhook',
    provider: 'portone',
    oid: paymentId ?? (data.billingKey ? String(data.billingKey) : null),
    raw: payload,
  });

  // 결제 완료 계열 이벤트만 GET 재검증 후 구독 확정 시도.
  // (단건. 정기 첫 청구/갱신은 charge-cron 이 직접 처리하므로 여기선 단건 보정 위주)
  if (paymentId && isPortoneConfigured() && /paid|Transaction\.Paid|PAID/i.test(type)) {
    try {
      const payment = await getPayment(paymentId);
      if (payment.status === 'PAID') {
        // billing_pending(oid=paymentId) 이 있으면 멱등 확정. 없으면 정기청구 건이라 무시.
        const result = await confirmPayment({ paymentId });
        if (!result.ok && result.reason !== 'unknown_order') {
          console.warn('[billing/webhook] confirm 실패', result.reason);
        }
      }
    } catch (e) {
      console.error('[billing/webhook] GET /payments 재검증 실패', e);
    }
  }

  return NextResponse.json({ ok: true });
}
