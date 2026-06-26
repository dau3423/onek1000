// 이메일 회원가입 — 이메일 인증 없이 즉시 계정 생성.
// 비밀번호는 scrypt 해시로만 저장하고, 신규 가입자 혜택(1주일 무료 trial + 추천코드)을
// OAuth 신규 가입과 동일하게 부여한다. 로그인(세션 발급)은 이 라우트가 아니라
// 클라이언트가 이어서 호출하는 signIn('credentials')가 담당한다.
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { hashPassword } from '@/lib/auth/password';
import { normEmail, normPassword, grantWelcomeTrial } from '@/lib/auth/options';
import { generateUniqueNickname } from '@/lib/nickname-db';
import { ensureReferralCode } from '@/lib/referral';

export const runtime = 'nodejs';

// 너무 약한 비밀번호만 막는 최소 규칙(8자 이상). 과한 제약은 가입 이탈을 키우므로 의도적으로 느슨하게.
const MIN_PASSWORD_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: '서버 설정 오류로 가입을 진행할 수 없습니다.' }, { status: 503 });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const email = normEmail(typeof body.email === 'string' ? body.email : '');
  const password = normPassword(typeof body.password === 'string' ? body.password : '');

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다.' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json({ error: `비밀번호는 ${MIN_PASSWORD_LEN}자 이상이어야 합니다.` }, { status: 400 });
  }

  const sb = getSupabase();

  // 중복 가입 방어: 이미 같은 이메일이 있으면 가입 방식에 맞는 안내를 준다.
  const { data: existing } = await sb
    .from('users')
    .select('id, password_hash')
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    if (existing.password_hash) {
      return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해 주세요.' }, { status: 409 });
    }
    // 소셜로 먼저 가입된 이메일(비밀번호 없음) → 소셜 로그인으로 유도.
    return NextResponse.json(
      { error: '소셜 계정으로 가입된 이메일입니다. 카카오/구글 로그인을 이용해 주세요.' },
      { status: 409 },
    );
  }

  const password_hash = await hashPassword(password);
  const nickname = await generateUniqueNickname();

  const { data: created, error } = await sb
    .from('users')
    .insert({ email, nickname, password_hash, provider: 'email' })
    .select('id')
    .single();

  if (error || !created) {
    // email unique 제약 위반(동시 가입 레이스 등) 포함 — 안전하게 충돌로 처리.
    const isDup = (error?.code === '23505') || /duplicate|unique/i.test(error?.message ?? '');
    if (isDup) {
      return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해 주세요.' }, { status: 409 });
    }
    console.error('[register] user insert 실패', error);
    return NextResponse.json({ error: '가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }

  // 신규 가입 혜택: OAuth 신규 가입과 동일하게 1주일 무료 trial + 추천코드 발급(best-effort).
  await grantWelcomeTrial(sb, created.id as string);
  await ensureReferralCode(created.id as string).catch(() => null);

  return NextResponse.json({ ok: true }, { status: 201 });
}
