// 회원탈퇴 (개인정보 삭제).
// - 로그인 필수: 세션의 email로만 본인 계정을 식별·삭제한다(클라이언트가 전달하는 id 신뢰 금지).
// - 처리 순서:
//   1) 활성 구독(trial/active)이 있으면 먼저 해지 처리(status=canceled, billing_key 제거)
//      → 이후 charge-cron이 빌링키로 청구하지 못하게 보장.
//   2) 리뷰 사진(review-photos 비공개 버킷) best-effort 삭제(실패해도 탈퇴 진행).
//   3) users 행 삭제 → DB FK on delete cascade로 favorites/vehicles/interest_regions/
//      reviews/push_subscriptions/subscriptions/billing_pending가 함께 삭제된다.
//      단, billing_events(결제·거래 이력)는 on delete set null이라 user_id만 NULL이 되고
//      행 자체는 보존된다(전자상거래법상 거래기록 보존 의무 고려).
// - Mock 모드(Supabase 미설정)에서는 외부 의존 없이 ok 응답만 반환한다.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Mock 모드: 삭제할 외부 저장소가 없으므로 성공으로 간주(클라이언트는 그대로 로그아웃).
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, mock: true });
  }

  const sb = getSupabase();
  const { data: user } = await sb
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .maybeSingle();

  // 이미 없는 계정이면 멱등적으로 성공 처리(클라이언트는 로그아웃 진행).
  if (!user) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  const userId = user.id as string;

  // 1) 활성 구독 해지(자동결제 청구 차단). 단건/만료건은 대상 아님.
  try {
    const { data: sub } = await sb
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['trial', 'active'])
      .maybeSingle();
    if (sub) {
      await sb
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          next_charge_at: null,
          billing_key: null,
        })
        .eq('id', sub.id);
      await sb.from('billing_events').insert({
        subscription_id: sub.id,
        user_id: userId,
        kind: 'cancel',
        provider: 'inicis',
        amount: 0,
      });
    }
  } catch (e) {
    // 구독 해지 실패가 탈퇴 자체를 막지 않도록 로깅만 한다.
    console.error('[account/delete] 구독 해지 처리 실패', e);
  }

  // 2) 리뷰 사진(storage) best-effort 삭제. DB 행은 users 삭제 시 cascade로 정리됨.
  try {
    const { data: reviews } = await sb
      .from('reviews')
      .select('photo_paths')
      .eq('user_id', userId);
    const paths = (reviews ?? [])
      .flatMap((r) => (Array.isArray(r.photo_paths) ? (r.photo_paths as string[]) : []))
      .filter(Boolean);
    if (paths.length > 0) {
      await sb.storage.from('review-photos').remove(paths);
    }
  } catch (e) {
    console.error('[account/delete] 리뷰 사진 삭제 실패(무시하고 진행)', e);
  }

  // 3) users 행 삭제 → 연관 개인데이터 cascade 삭제, 거래기록은 user_id NULL 보존.
  const { error } = await sb.from('users').delete().eq('id', userId);
  if (error) {
    console.error('[account/delete] users 삭제 실패', error);
    return NextResponse.json({ error: 'delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
