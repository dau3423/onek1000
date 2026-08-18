// 관리자 전용 — 리뷰 신고 모더레이션 대기열 조회.
// 가드: 세션 이메일이 ADMIN_EMAILS에 포함될 때만 허용(아니면 404로 존재 비노출).
//
//  GET → { pending, hidden, reportsTableMissing }
//        pending: 미처리 신고가 있는 리뷰(리뷰 단위로 묶임, 신고 건수 많은 순)
//        hidden : 현재 전역 숨김 상태인 리뷰(신고 유무 무관, 숨김 해제 대상)
//        reportsTableMissing: review_reports(0041) 미적용이면 true — pending 은 항상 []

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isAdminEmail } from '@/lib/auth/admin';
import { getModerationQueue } from '@/lib/db/admin-reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (session?.revoked) return false;
  return isAdminEmail(session?.user?.email);
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const queue = await getModerationQueue();
  return NextResponse.json(queue);
}
