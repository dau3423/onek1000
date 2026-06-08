// 친구 추천(레퍼럴) 서버 헬퍼.
// - referral_code 발급(가입 시 또는 첫 조회 시 lazy) + 충돌 시 재시도.
// - claim 시 사용하는 "프리미엄 +7일 연장" 헬퍼(무료 혜택 — 결제/PortOne 로직 불변, 구독 row 기간만 손댐).
//
// Mock/미설정 환경(isSupabaseConfigured()===false)에서는 DB가 없으므로 모든 함수가 안전하게
// no-op/null을 반환한다. 어떤 실패도 호출 흐름(로그인/마이페이지)을 깨뜨리지 않게 best-effort.

import crypto from 'crypto';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

// 추천 보너스 기간(일). welcome trial(7일)과 동일하게 운영상 조정 가능하도록 상수 분리.
export const REFERRAL_BONUS_DAYS = 7;

/** subscriptions 조회 결과(필요 컬럼만). expires_at은 0008 미적용 환경에서 없을 수 있다. */
interface SubRow {
  id: string;
  status: string;
  current_period_end: string | null;
  trial_end: string | null;
  expires_at?: string | null;
}

// 추천 코드 길이/문자셋. base62(혼동 문자 포함, 짧고 URL-safe). 6~8자리 권장 → 7자리 채택.
const CODE_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LENGTH = 7;

/** base62 랜덤 코드 생성(crypto 기반, 모듈로 편향 무시 가능 수준). */
function randomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * 사용자의 추천 코드를 보장한다(없으면 발급). 반환: 코드 문자열 또는 null(미설정/실패).
 * - 이미 referral_code가 있으면 그대로 반환(멱등).
 * - 없으면 랜덤 base62 코드를 생성해 update. unique 충돌 시 최대 5회 재시도.
 * - 0023 미적용 환경(컬럼 부재)에서는 update가 에러 → null 폴백(호출 흐름 보호).
 */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  if (!userId || !isSupabaseConfigured()) return null;
  const sb = getSupabase();

  // 1) 기존 코드 확인.
  const { data: existing, error: readErr } = await sb
    .from('users')
    .select('referral_code')
    .eq('id', userId)
    .maybeSingle();
  if (readErr) return null; // referral_code 컬럼 부재 등 → 폴백
  const current = (existing?.referral_code as string | null) ?? null;
  if (current) return current;

  // 2) 없으면 발급(충돌 재시도).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { data, error } = await sb
      .from('users')
      .update({ referral_code: code, updated_at: new Date().toISOString() })
      .eq('id', userId)
      // referred_by와 무관하게, 아직 코드가 없을 때만 쓴다(동시성 방어).
      .is('referral_code', null)
      .select('referral_code')
      .maybeSingle();
    if (!error && data?.referral_code) return data.referral_code as string;
    // unique 위반(23505) 등 충돌이면 다른 코드로 재시도. 그 외 에러는 즉시 폴백.
    if (error && error.code !== '23505') return null;
    // update 했는데 row가 안 잡힌 경우(다른 요청이 먼저 코드를 채움) → 재조회.
    if (!error && !data) {
      const { data: refetched } = await sb
        .from('users')
        .select('referral_code')
        .eq('id', userId)
        .maybeSingle();
      const c = (refetched?.referral_code as string | null) ?? null;
      if (c) return c;
    }
  }
  return null;
}

/**
 * 프리미엄 +N일 연장(무료 혜택). 결제(PortOne) 로직은 건드리지 않고 subscriptions row만 손댄다.
 * - 유효 구독(trial/active, 또는 canceled+기간유효)이 있으면 그 만료(expires_at/current_period_end/
 *   trial_end 중 적용분)를 +N일.
 * - 없으면 welcome trial과 동일 구조의 trial row를 신규 생성(만료=now+N일).
 * 반환: 연장/생성 성공 여부.
 */
export async function extendPremiumDays(userId: string, days: number = REFERRAL_BONUS_DAYS): Promise<boolean> {
  if (!userId || !isSupabaseConfigured()) return false;
  const sb = getSupabase();
  const addMs = days * 86400000;
  const now = new Date();
  const nowIso = now.toISOString();

  // 최신 구독 1건 조회(welcome trial 포함). expires_at은 0008 미적용 환경에서 없을 수 있다.
  let sub: SubRow | null = null;
  const q = await sb
    .from('subscriptions')
    .select('id, status, current_period_end, trial_end, expires_at')
    .eq('user_id', userId)
    .in('status', ['trial', 'active', 'canceled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (q.error) {
    const fb = await sb
      .from('subscriptions')
      .select('id, status, current_period_end, trial_end')
      .eq('user_id', userId)
      .in('status', ['trial', 'active', 'canceled'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fb.error) return false;
    sub = (fb.data as unknown as SubRow | null) ?? null;
  } else {
    sub = (q.data as unknown as SubRow | null) ?? null;
  }

  if (sub) {
    // 기존 만료 기준(미래면 그 값, 과거/없으면 now)에서 +days.
    const baseStr = sub.expires_at ?? sub.current_period_end ?? sub.trial_end ?? null;
    const baseMs = baseStr ? new Date(baseStr).getTime() : 0;
    const fromMs = Math.max(baseMs, now.getTime());
    const newEnd = new Date(fromMs + addMs).toISOString();

    // 어느 컬럼이 만료 기준인지에 맞춰 갱신. 보수적으로 trial/current_period_end 둘 다 맞춰
    // getPremiumStatus 폴백(expires_at||current_period_end||trial_end)이 항상 새 값을 읽게 한다.
    const patch: Record<string, unknown> = { updated_at: nowIso };
    if (sub.expires_at !== undefined) patch.expires_at = newEnd;
    if (sub.status === 'trial') patch.trial_end = newEnd;
    patch.current_period_end = newEnd;
    const { error } = await sb.from('subscriptions').update(patch).eq('id', sub.id);
    if (!error) return true;
    // expires_at 미적용 환경 방어: 해당 컬럼 빼고 1회 재시도.
    const { error: retryErr } = await sb
      .from('subscriptions')
      .update({ updated_at: nowIso, current_period_end: newEnd, ...(sub.status === 'trial' ? { trial_end: newEnd } : {}) })
      .eq('id', sub.id);
    return !retryErr;
  }

  // 유효 구독이 없으면 welcome trial과 동일 구조의 trial 신규 생성.
  const end = new Date(now.getTime() + addMs).toISOString();
  const { error } = await sb.from('subscriptions').insert({
    user_id: userId,
    status: 'trial',
    plan: 'monthly_1000',
    plan_type: 'recurring',
    provider: 'referral', // 무료 혜택(추천) 표식 — 빌링 provider('portone')와 구분
    customer_key: `referral:${userId}`, // NOT NULL 충족용 합성값(PG 거래 없음)
    trial_end: end,
    current_period_start: nowIso,
    current_period_end: end,
    next_charge_at: null,
    updated_at: nowIso,
  });
  if (!error) return true;
  // 컬럼 차이 환경 방어: 최소 컬럼만으로 재시도.
  const retry = await sb.from('subscriptions').insert({
    user_id: userId,
    status: 'trial',
    plan: 'monthly_1000',
    customer_key: `referral:${userId}`,
    trial_end: end,
    current_period_end: end,
    updated_at: nowIso,
  });
  return !retry.error;
}
