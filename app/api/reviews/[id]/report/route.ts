// 리뷰 신고 접수. 로그인 필수, 본인 리뷰는 신고 불가, 사용자당 리뷰당 1건.
// 접수 즉시 그 리뷰는 **신고자에게만** 보이지 않는다(개인 숨김은 이 행에서 파생되므로 별도 저장 없음).
// 전역 숨김은 운영자가 /admin/reviews 에서 판단한다 — 자동 숨김은 악용 경로가 되어 만들지 않는다.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { isReportReason, REPORT_DETAIL_MAX } from '@/types/review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json()) as { reason?: string; detail?: string };
  if (!isReportReason(body.reason)) {
    return NextResponse.json({ error: 'invalid reason' }, { status: 400 });
  }
  const detail = (body.detail ?? '').trim().slice(0, REPORT_DETAIL_MAX);

  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, mock: true });

  const sb = getSupabase();

  // 본인 리뷰 신고 차단 — 자기 글을 자기 화면에서 숨기는 용도로 쓰이면 신고 데이터가 오염된다.
  const { data: rev } = await sb.from('reviews').select('user_id').eq('id', params.id).maybeSingle();
  if (!rev) return NextResponse.json({ error: 'review not found' }, { status: 404 });
  if (rev.user_id === userId) {
    return NextResponse.json({ error: 'cannot report own review' }, { status: 400 });
  }

  const { error } = await sb
    .from('review_reports')
    .upsert(
      { review_id: params.id, user_id: userId, reason: body.reason, detail: detail || null },
      { onConflict: 'review_id,user_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
