// 관리자 전용 — 제보 승인/반려.
//
//  PATCH { approve: boolean, note?: string }
//
// 승인이 곧 반영이다. 별도의 '적용' 단계가 없는 이유:
//   - 정비소 브랜드: repair_brand_override 뷰가 status='approved' 를 읽고, bbox RPC 가 그걸
//     coalesce 로 덮어쓴다. repair_shops.brand 를 직접 UPDATE 하면 다음 sync-repair 가 지운다.
//   - 유가: fuel_price_report_active 뷰가 승인 + 오피넷 기준일보다 최신인 건만 노출한다.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getAdminOrNull } from '@/lib/auth/admin';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { resolveCorrection } from '@/lib/db/corrections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.revoked) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const admin = await getAdminOrNull();
  if (!admin) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: { approve?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'json body expected' }, { status: 400 });
  }
  if (typeof body.approve !== 'boolean') {
    return NextResponse.json({ error: 'approve(boolean) required' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 300) : null;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const result = await resolveCorrection(params.id, body.approve, admin, note);
  // 이미 처리된 건(동시 클릭) 도 notFound 로 온다 — 화면은 목록을 다시 불러 정합을 맞춘다.
  if (result.notFound) return NextResponse.json({ error: 'correction not found' }, { status: 404 });
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'update failed' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
