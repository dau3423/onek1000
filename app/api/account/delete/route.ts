// 회원탈퇴 (소프트삭제 — users.deleted_at 기록).
// - 로그인 필수: 세션의 email로만 본인 계정을 식별한다(클라이언트가 전달하는 id 신뢰 금지).
// - 정책(확정): 행/연관 데이터를 삭제하지 않고 deleted_at 타임스탬프로 탈퇴 상태만 구분한다.
//   같은 소셜계정으로 재로그인하면 deleted_at을 NULL로 되돌려 계정·데이터를 그대로 복원한다.
//   (복구 로직은 lib/auth/options.ts signIn 콜백에 있다.)
// - 처리 순서:
//   1) 활성 구독(trial/active)이 있으면 먼저 해지 처리(status=canceled, billing_key/next_charge_at 제거).
//      → 이후 charge-cron이 빌링키로 자동청구하지 못하게 보장한다(탈퇴해도 결제는 반드시 막아야 함).
//   2) users 행에 deleted_at = now() 기록(DELETE 아님). 연관 데이터(즐겨찾기/주유기록/리뷰/
//      푸시구독/관심지역/차량)와 리뷰 사진 스토리지는 복구 대비로 삭제하지 않는다.
//   3) signOut(세션 무효화)은 클라이언트에서 수행한다.
// - 멱등: 이미 deleted_at이 있는(이미 탈퇴한) 사용자가 또 호출해도 성공으로 처리한다.
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

  // Mock 모드: 처리할 외부 저장소가 없으므로 성공으로 간주(클라이언트는 그대로 로그아웃).
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, mock: true });
  }

  const sb = getSupabase();
  const { data: user } = await sb
    .from('users')
    .select('id, deleted_at')
    .eq('email', session.user.email)
    .maybeSingle();

  // 없는 계정이면 멱등적으로 성공 처리(클라이언트는 로그아웃 진행).
  if (!user) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  const userId = user.id as string;

  // 이미 탈퇴한(소프트삭제된) 계정이면 멱등 처리 — 구독 해지/타임스탬프 갱신 없이 성공.
  if (user.deleted_at) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  // 1) 활성 구독 해지(자동결제 청구 차단). 단건/만료건은 대상 아님.
  //    탈퇴를 철회(재로그인 복구)하더라도 구독은 자동 부활하지 않는다(보수적·안전).
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
        provider: 'portone',
        amount: 0,
      });
    }
  } catch (e) {
    // 구독 해지 실패가 탈퇴 자체를 막지 않도록 로깅만 한다.
    console.error('[account/delete] 구독 해지 처리 실패', e);
  }

  // 2) 소프트삭제: users.deleted_at = now(). 연관 데이터/리뷰 사진은 보존(복구 대비).
  const { error } = await sb
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    console.error('[account/delete] 소프트삭제(deleted_at) 실패', error);
    return NextResponse.json({ error: 'delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
