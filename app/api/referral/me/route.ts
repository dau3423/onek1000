// 내 추천 정보 조회 — 로그인 필요.
// 내 추천 코드(없으면 lazy 발급) + 추천 성공 N명(referred_by = 나)을 반환한다.
// 마이페이지 "친구 추천" 섹션에서 사용한다.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { ensureReferralCode } from '@/lib/referral';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Mock/미설정: 코드 없이 안내만(앱 안 깨짐).
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ code: null, successCount: 0 });
  }

  const sb = getSupabase();
  const { data: me } = await sb
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!me?.id) return NextResponse.json({ code: null, successCount: 0 });
  const userId = me.id as string;

  // 코드 lazy 발급(없으면 생성). 실패 시 null.
  const code = await ensureReferralCode(userId);

  // 추천 성공 N명(referred_by = 나). 컬럼 부재 등 에러는 0 폴백.
  const { count } = await sb
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by', userId);

  return NextResponse.json({ code, successCount: count ?? 0 });
}
