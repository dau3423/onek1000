// 토스페이먼츠 결제 결과 웹훅 수신
// https://docs.tosspayments.com/guides/webhook
// 알파 단계에선 charge-cron에서 결과를 즉시 처리하므로 보조용. 결제 실패/취소 알림 처리에 활용.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true }); // dev 환경

  const body = await req.json().catch(() => ({}));
  const sb = getSupabase();

  // 보안: 토스 IP allow list 또는 시그니처 검증 추가 권장 (Toss는 서명 헤더 별도 안 줌 → IP 기반)
  await sb.from('billing_events').insert({
    kind: 'webhook',
    amount: typeof body?.totalAmount === 'number' ? body.totalAmount : null,
    toss_payment_key: body?.paymentKey ?? null,
    toss_order_id: body?.orderId ?? null,
    raw: body,
  });

  // status별 액션 (운영 시 확장)
  // - DONE → 결제 성공 처리
  // - CANCELED / FAILED → 구독 상태 past_due 마킹

  return NextResponse.json({ ok: true });
}
