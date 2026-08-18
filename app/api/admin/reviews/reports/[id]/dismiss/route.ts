// 관리자 전용 — 신고 1건 기각(리뷰는 그대로 둔다).
// 가드: 세션 이메일이 ADMIN_EMAILS에 포함될 때만 허용(아니면 404로 존재 비노출).
//
//  POST → 해당 review_reports 행에 resolved_at 만 찍는다. 리뷰의 is_hidden 은 건드리지 않는다.
//         이미 처리된 신고에 다시 호출해도(더블클릭) resolved_at 조건에 걸려 0행 매치로 조용히
//         끝난다 — 항상 200(멱등).

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isAdminEmail } from '@/lib/auth/admin';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { dismissReport } from '@/lib/db/admin-reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (session?.revoked) return false;
  return isAdminEmail(session?.user?.email);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const result = await dismissReport(params.id);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'update failed' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
