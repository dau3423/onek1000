// 비밀번호 재설정 토큰 헬퍼.
// - 평문 토큰은 URL로만 1회 전달되고 DB엔 sha256 해시만 저장한다.
// - 검증 시 입력 토큰을 같은 방식으로 해시해 token_hash와 비교한다.
import crypto from 'crypto';

const TOKEN_BYTES = 32; // 256비트 — 추측 불가능한 길이
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1시간

/** URL에 실어 보낼 평문 토큰과, DB에 저장할 해시를 함께 만든다. */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  return { token, tokenHash: hashResetToken(token) };
}

/** 평문 토큰 → DB 조회/비교용 sha256 해시(hex). */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
