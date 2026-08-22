// 관리자 전용 — 제보(정정 요청) 대기열 조회.
// 가드: 세션 이메일이 ADMIN_EMAILS에 포함될 때만 허용(아니면 404로 존재 비노출) — /api/admin/reviews 와 동형.
//
//  GET → { pending, tableMissing }
//        pending: 미처리 제보(오래된 순). 대상 이름·주소·현재값·첨부 사진 서명URL 포함.
//        tableMissing: place_corrections(0049) 미적용이면 true — pending 은 항상 []

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isAdminEmail } from '@/lib/auth/admin';
import { getCorrectionQueue } from '@/lib/db/corrections';

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
  return NextResponse.json(await getCorrectionQueue());
}
