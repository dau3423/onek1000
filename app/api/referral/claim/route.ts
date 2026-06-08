// 친구 추천 클레임 — 로그인 필요.
// 흐름: 클라이언트가 ref 쿠키(또는 body.code)를 들고 로그인 상태에서 POST.
//  - ref code → 추천인 조회. 추천인 ≠ 본인. 본인 referred_by가 아직 null(1인 1회).
//  - 통과 시: 본인 referred_by=추천인 set + 본인·추천인 둘 다 프리미엄 +7일.
//  - 멱등: 이미 referred_by 있으면 no-op(already). 실패/부적격은 조용히 ok:false(앱 안 깨짐).
//
// 보안(SEC-5 등): 추천인 검증/구독 연장은 전적으로 서버에서 수행한다. 클라 값(코드)만 신뢰원으로
// 받되, 자기추천·중복·존재하지 않는 코드를 모두 서버에서 방어한다. 보상은 신규 가입자(클레임자)와
// 그 추천인에게만 가므로 코드 추측은 무의미하다.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { extendPremiumDays } from '@/lib/referral';

export const runtime = 'nodejs';

// 클레임 가능 기간(가입 후 N일). 너무 오래된 기존 계정이 추천 보상만 노리는 남용을 막는다.
// created_at 컬럼이 없는 환경에서는 이 제한을 적용하지 않고 referred_by null 조건만으로 판정한다.
const CLAIM_WINDOW_DAYS = 30;

// 추천 쿠키 이름(클라이언트 components/referral/ReferralClaim.tsx와 동일해야 함).
const REF_COOKIE = 'onek_ref';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // DB 미설정(Mock) 환경: 부적격으로 조용히 무시(앱 안 깨짐).
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: 'not_configured' });
  }

  // 코드: body 우선, 없으면 쿠키.
  let code: string | undefined;
  try {
    const body = (await req.json()) as { code?: unknown };
    if (typeof body?.code === 'string') code = body.code;
  } catch {
    // body 없음/파싱 실패 → 쿠키로 폴백
  }
  if (!code) {
    const cookie = req.headers.get('cookie') ?? '';
    const m = cookie.match(new RegExp(`(?:^|; )${REF_COOKIE}=([^;]+)`));
    if (m) code = decodeURIComponent(m[1]);
  }
  code = (code ?? '').trim();
  // 코드 형식 가드(base62, 4~16자). 비정상 입력은 조용히 무시.
  if (!code || !/^[0-9A-Za-z]{4,16}$/.test(code)) {
    return clearRefCookie(NextResponse.json({ ok: false, reason: 'invalid_code' }));
  }

  const sb = getSupabase();

  // 본인 조회(id/referred_by/created_at). referral_code 컬럼 부재면 select 에러 → 폴백.
  const me = await sb
    .from('users')
    .select('id, referred_by, created_at')
    .eq('email', session.user.email)
    .maybeSingle();
  if (me.error || !me.data) {
    return clearRefCookie(NextResponse.json({ ok: false, reason: 'unavailable' }));
  }
  const myId = me.data.id as string;
  const myReferredBy = (me.data.referred_by as string | null) ?? null;

  // 멱등: 이미 추천인이 set이면 no-op(쿠키만 정리).
  if (myReferredBy) {
    return clearRefCookie(NextResponse.json({ ok: false, reason: 'already' }));
  }

  // 가입 기간 제한(남용 방지). created_at이 있을 때만 적용.
  const createdAt = (me.data.created_at as string | null) ?? null;
  if (createdAt) {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    if (ageMs > CLAIM_WINDOW_DAYS * 86400000) {
      return clearRefCookie(NextResponse.json({ ok: false, reason: 'expired_window' }));
    }
  }

  // 추천인 조회(code → user). 존재하지 않으면 무시.
  const ref = await sb
    .from('users')
    .select('id')
    .eq('referral_code', code)
    .maybeSingle();
  if (ref.error || !ref.data) {
    return clearRefCookie(NextResponse.json({ ok: false, reason: 'no_referrer' }));
  }
  const referrerId = ref.data.id as string;

  // 자기추천 금지.
  if (referrerId === myId) {
    return clearRefCookie(NextResponse.json({ ok: false, reason: 'self' }));
  }

  // referred_by set — 동시성/멱등 방어로 referred_by가 아직 null일 때만 쓴다.
  const set = await sb
    .from('users')
    .update({ referred_by: referrerId, updated_at: new Date().toISOString() })
    .eq('id', myId)
    .is('referred_by', null)
    .select('id')
    .maybeSingle();
  if (set.error) {
    return clearRefCookie(NextResponse.json({ ok: false, reason: 'set_failed' }));
  }
  if (!set.data) {
    // 경합으로 그 사이 다른 요청이 먼저 채움 → 멱등 no-op.
    return clearRefCookie(NextResponse.json({ ok: false, reason: 'already' }));
  }

  // 보상: 본인·추천인 둘 다 +7일(무료 혜택). 한쪽 실패해도 다른쪽은 그대로 진행(best-effort).
  const [meOk, refOk] = await Promise.all([
    extendPremiumDays(myId).catch(() => false),
    extendPremiumDays(referrerId).catch(() => false),
  ]);

  return clearRefCookie(
    NextResponse.json({ ok: true, bonusDays: 7, rewarded: { me: meOk, referrer: refOk } }),
  );
}

/** 클레임 처리(성공/부적격 무관)가 끝나면 ref 쿠키를 삭제해 재시도 루프를 막는다. */
function clearRefCookie(res: NextResponse): NextResponse {
  res.cookies.set(REF_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
