// 모바일 redirect 수신 엔드포인트 (포트원 v2 redirectUrl).
// 모바일 결제창은 인증 완료 후 이 URL로 GET 리다이렉트한다.
//   - 단건 결제:  ?paymentId=...&code=...&message=...&transactionType=PAYMENT
//   - 정기 빌링키: ?billingKey=...&code=...&message=...&transactionType=ISSUE_BILLING_KEY
//                  (issueId 는 우리가 redirectUrl 쿼리에 미리 실어 보낸 값으로 보존)
// billing_pending(oid) 신뢰원 + 서버 재검증으로 확정한 뒤 결과 페이지로 303 리다이렉트.
// (cross-site GET이라 세션 비의존 — confirm 로직과 동일 신뢰원)

import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { isPortoneConfigured } from '@/lib/billing/portone';
import { confirmPayment } from '@/lib/billing/confirm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirectTo(req: Request, path: string): NextResponse {
  const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  return NextResponse.redirect(new URL(path, origin), 303);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;

  // 결제창 인증 실패(사용자 취소 등) — code 가 있으면 실패.
  const code = q.get('code');
  if (code) {
    const msg = q.get('message') || code;
    return redirectTo(req, `/billing/fail?reason=${encodeURIComponent(msg)}`);
  }

  if (!isSupabaseConfigured() || !isPortoneConfigured()) {
    return redirectTo(req, '/billing/fail?reason=unconfigured');
  }

  const paymentId = q.get('paymentId') || undefined;
  const billingKey = q.get('billingKey') || undefined;
  // 정기: redirectUrl에 우리가 실어 보낸 issueId(없으면 paymentId 쿼리에 담긴 식별자 사용)
  const issueId = q.get('issueId') || undefined;

  if (!paymentId && !billingKey) {
    return redirectTo(req, '/billing/fail?reason=missing');
  }

  const result = await confirmPayment({ paymentId, billingKey, issueId });
  if (!result.ok) {
    return redirectTo(req, `/billing/fail?reason=${encodeURIComponent(result.reason)}`);
  }
  return redirectTo(req, `/billing/success?status=ok&plan=${result.plan}`);
}

// 일부 환경에서 POST 로 올 가능성 대비(쿼리/폼 동일 처리).
export async function POST(req: Request) {
  return GET(req);
}
