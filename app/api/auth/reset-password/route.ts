// 비밀번호 재설정 실행 — 메일로 받은 토큰을 검증하고 새 비밀번호로 교체한다.
//  - 토큰: 만료·1회용 검증(used_at). 통과 시 password_hash를 새로 저장한다.
//  - 보안: 비밀번호가 바뀌면 기존 로그인 세션을 모두 무효화한다(session_id 회전 → 다른 기기 강제 로그아웃).
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { normPassword } from '@/lib/auth/options';
import { hashResetToken } from '@/lib/auth/reset';
import { hashPassword } from '@/lib/auth/password';

export const runtime = 'nodejs';

const MIN_PASSWORD_LEN = 8;
// 매 호출마다 새 응답 생성(Response 인스턴스 재사용 시 본문 스트림이 한 번만 소비되어 깨짐).
const invalid = () =>
  NextResponse.json({ error: '링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.' }, { status: 400 });

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: '서버 설정 오류로 처리할 수 없습니다.' }, { status: 503 });
  }

  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const password = normPassword(typeof body.password === 'string' ? body.password : '');
  if (!token) return invalid();
  if (password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json({ error: `비밀번호는 ${MIN_PASSWORD_LEN}자 이상이어야 합니다.` }, { status: 400 });
  }

  const sb = getSupabase();
  const tokenHash = hashResetToken(token);
  const { data: row } = await sb
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  // 토큰 없음/이미 사용/만료 → 동일한 무효 응답.
  if (!row || row.used_at) return invalid();
  if (new Date(row.expires_at).getTime() < Date.now()) return invalid();

  const password_hash = await hashPassword(password);
  // 비밀번호 교체 + 세션 무효화(다른 기기 강제 로그아웃). updated_at도 갱신.
  const { error: updErr } = await sb
    .from('users')
    .update({
      password_hash,
      session_id: crypto.randomUUID(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.user_id);
  if (updErr) {
    console.error('[reset-password] 비밀번호 갱신 실패', updErr);
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }

  // 사용 처리 + 해당 사용자의 남은 토큰 일괄 정리(재사용 차단).
  await sb.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', row.id);
  await sb.from('password_reset_tokens').delete().eq('user_id', row.user_id).is('used_at', null);

  return NextResponse.json({ ok: true });
}
