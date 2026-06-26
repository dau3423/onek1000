// 이메일 가입용 비밀번호 해싱 — 외부 의존성 없이 node:crypto의 scrypt 사용.
// 저장 형식: 'scrypt$N$r$p$saltHex$hashHex' (파라미터를 함께 보관해 향후 조정에 유연).
// scrypt는 메모리-하드 KDF라 bcrypt 대비 GPU 무차별 대입에 강하다.
import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'crypto';

// promisify(scrypt)는 options 인자 오버로드를 타입으로 좁히지 못해(3-arg만 인식) 직접 래핑한다.
function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// 권장 파라미터(N=16384, r=8, p=1)는 서버 부하와 보안의 균형점.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

/** 평문 비밀번호를 'scrypt$N$r$p$salt$hash' 문자열로 해시한다. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * 저장된 해시와 평문을 타이밍 안전 비교한다.
 * - 형식이 깨졌거나 scrypt가 아니면 false(소셜 전용 계정 등 password_hash가 NULL이면 호출 전에 걸러진다).
 */
export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const n = Number(nStr), r = Number(rStr), p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = await scryptAsync(plain, salt, expected.length, { N: n, r, p, maxmem: 64 * 1024 * 1024 });
  // 길이가 다르면 timingSafeEqual이 throw하므로 먼저 방어.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
