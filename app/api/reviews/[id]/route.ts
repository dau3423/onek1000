// 본인 리뷰 삭제
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { deleteReviewPhotos } from '@/lib/storage/photos';
import { removeMockReview } from '@/lib/mock/reviews';

export const runtime = 'nodejs';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!isSupabaseConfigured()) {
    removeMockReview(params.id);
    return NextResponse.json({ ok: true });
  }

  const sb = getSupabase();
  const { data: user } = await sb.from('users').select('id').eq('email', session.user.email).maybeSingle();
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // 본인 리뷰 확인 + 사진 경로 회수
  const { data: review, error: e1 } = await sb
    .from('reviews')
    .select('id, user_id, photo_paths')
    .eq('id', params.id)
    .maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!review) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (review.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // storage 사진 먼저 정리
  try { await deleteReviewPhotos(review.photo_paths ?? []); } catch { /* swallow */ }

  const { error: e2 } = await sb.from('reviews').delete().eq('id', params.id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
