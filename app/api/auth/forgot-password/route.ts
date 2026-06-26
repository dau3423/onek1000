// 비밀번호 재설정 요청 — 가입 이메일로 재설정 링크를 발송한다.
// 보안: 이메일 존재 여부를 노출하지 않도록 어떤 경우에도 동일한 200 응답을 준다(사용자 열거 방지).
//  - 이메일 가입 계정(password_hash 있음)에만 실제로 링크를 보낸다.
//  - 소셜 전용 계정/미가입 이메일은 조용히 무시한다(응답은 동일).
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { normEmail } from '@/lib/auth/options';
import { generateResetToken, RESET_TOKEN_TTL_MS } from '@/lib/auth/reset';
import { sendEmail, passwordResetEmailHtml } from '@/lib/email/resend';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 같은 계정에서 60초 내 재요청은 메일 폭탄/스팸 방지를 위해 새 링크를 보내지 않는다(응답은 동일).
const RESEND_COOLDOWN_MS = 60 * 1000;

// 항상 같은 메시지로 응답(존재 여부 비노출). Response 인스턴스는 재사용하면 본문 스트림이
// 한 번만 소비되어 다음 요청에서 깨지므로, 매 호출마다 새로 만든다.
const ok = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return ok();
  }

  const email = normEmail(typeof body.email === 'string' ? body.email : '');
  if (!EMAIL_RE.test(email) || !isSupabaseConfigured()) return ok();

  try {
    const sb = getSupabase();
    // 이메일 가입 계정만 대상(password_hash 보유). 소셜 전용/미가입은 user가 없거나 hash가 NULL.
    const { data: user } = await sb
      .from('users')
      .select('id, password_hash')
      .eq('email', email)
      .maybeSingle();
    if (!user?.password_hash) return ok();

    // 쿨다운: 최근 발급된(미사용) 토큰이 있으면 재발송하지 않는다.
    const since = new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString();
    const { data: recent } = await sb
      .from('password_reset_tokens')
      .select('id')
      .eq('user_id', user.id)
      .is('used_at', null)
      .gt('created_at', since)
      .limit(1)
      .maybeSingle();
    if (recent) return ok();

    // 기존 미사용 토큰은 무효화(정리)하고 새 토큰 1개만 활성으로 둔다.
    await sb.from('password_reset_tokens').delete().eq('user_id', user.id).is('used_at', null);

    const { token, tokenHash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    const { error: insErr } = await sb.from('password_reset_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (insErr) {
      console.error('[forgot-password] 토큰 저장 실패', insErr);
      return ok();
    }

    const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;
    const resetUrl = `${origin}/auth/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: '[1000냥 주유소] 비밀번호 재설정 링크',
      html: passwordResetEmailHtml(resetUrl),
    });
  } catch (e) {
    // 어떤 실패도 응답으로 노출하지 않는다(열거 방지·UX 일관성).
    console.error('[forgot-password] 처리 예외', e);
  }

  return ok();
}
