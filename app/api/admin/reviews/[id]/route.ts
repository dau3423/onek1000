// 관리자 전용 — 리뷰 전역 숨김/숨김 해제.
// 가드: 세션 이메일이 ADMIN_EMAILS에 포함될 때만 허용(아니면 404로 존재 비노출).
//
//  PATCH { hidden: boolean }
//        → reviews.is_hidden 설정. hidden=true 면 그 리뷰의 미처리 신고를 함께 resolved_at 처리
//          (안 그러면 방금 숨긴 리뷰가 대기열에 다시 보인다). 자동 숨김 로직은 없다 — 이 호출은
//          항상 운영자가 화면에서 누른 버튼에서만 온다.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isAdminEmail } from '@/lib/auth/admin';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { setReviewHidden } from '@/lib/db/admin-reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (session?.revoked) return false;
  return isAdminEmail(session?.user?.email);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let body: { hidden?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'json body expected' }, { status: 400 });
  }
  if (typeof body.hidden !== 'boolean') {
    return NextResponse.json({ error: 'hidden(boolean) required' }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const result = await setReviewHidden(params.id, body.hidden);
  if (result.notFound) return NextResponse.json({ error: 'review not found' }, { status: 404 });
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'update failed' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
