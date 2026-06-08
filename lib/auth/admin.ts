// 관리자 접근 가드 — 서버 전용.
// 관리자 판정은 환경변수 ADMIN_EMAILS(콤마구분 이메일 목록)로만 한다(이메일 하드코딩 금지).
//
// 미설정 시 동작(안전 기본값):
//   - ADMIN_EMAILS가 비어 있으면 "관리자 없음"으로 간주 → 모든 접근 거부.
//     (운영 배포에서 실수로 가드가 열리는 것을 막는다. 운영자는 ADMIN_EMAILS에
//      본인 로그인 이메일을 반드시 설정해야 /admin·/admin/* 에 접근할 수 있다.)

import { getServerSession } from 'next-auth';
import { authOptions } from './options';

/** 이메일 정규화: trim + 소문자(이메일은 대소문자 구분 없음). */
function normEmail(v: string | undefined | null): string {
  return (v ?? '').trim().toLowerCase();
}

/** 설정된 관리자 이메일 집합(정규화). 미설정이면 빈 배열. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => normEmail(s))
    .filter(Boolean);
}

/** 주어진 이메일이 관리자 목록에 포함되는지. 목록이 비어 있으면 항상 false. */
export function isAdminEmail(email: string | undefined | null): boolean {
  const e = normEmail(email);
  if (!e) return false;
  const list = adminEmails();
  return list.length > 0 && list.includes(e);
}

/**
 * 현재 세션이 관리자면 이메일을, 아니면 null을 반환.
 * 서버 컴포넌트에서 호출해 가드한다(아니면 notFound() 등으로 거부).
 */
export async function getAdminOrNull(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  // 중복 로그인으로 무효화된 세션은 비로그인 취급.
  if (session?.revoked) return null;
  const email = session?.user?.email ?? null;
  return isAdminEmail(email) ? normEmail(email) : null;
}
