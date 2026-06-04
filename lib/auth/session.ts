// 서버 컴포넌트/API Routes에서 세션 조회 헬퍼

import { getServerSession } from 'next-auth';
import { authOptions } from './options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  // 중복 로그인으로 무효화된 세션은 비로그인으로 취급(서버 가드/회원 전용 API 보호).
  if (session?.revoked) return null;
  if (!session?.user?.email) return null;
  return session.user;
}

export interface PremiumStatus {
  isPremium: boolean;
  status: 'trial' | 'active' | 'canceled' | 'expired' | 'none';
  periodEnd?: string;
}

/**
 * 사용자 구독 상태 조회 — 광고 노출 분기에 사용.
 * 정기(자동갱신)·단건(만료형) 모두 지원.
 * - trial/active: 기간 유효하면 프리미엄.
 * - canceled: 다음 결제는 끊겼지만 이미 결제한 기간 종료일까지는 프리미엄 유지.
 */
/** subscriptions 조회 결과(필요 컬럼만). expires_at은 0008 미적용 환경에서 없을 수 있다. */
interface SubscriptionRow {
  status: string;
  current_period_end: string | null;
  trial_end: string | null;
  expires_at?: string | null;
}

export async function getPremiumStatus(userId?: string): Promise<PremiumStatus> {
  if (!userId || !isSupabaseConfigured()) return { isPremium: false, status: 'none' };
  const sb = getSupabase();

  // 마이그레이션 0008(expires_at 추가) 미적용 환경 방어:
  // expires_at 포함 select가 컬럼 부재로 에러나면, 콜백이 throw되어 로그인 전체가 깨진다.
  // → expires_at 없이 재조회하는 graceful fallback으로 0008 적용 여부와 무관하게 세션을 보호한다.
  const baseQuery = (cols: string) =>
    sb
      .from('subscriptions')
      .select(cols)
      .eq('user_id', userId)
      .in('status', ['trial', 'active', 'canceled'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

  let data: SubscriptionRow | null = null;
  const withExpires = await baseQuery('status, current_period_end, trial_end, expires_at');
  if (withExpires.error) {
    // 컬럼 부재 등으로 실패 시 expires_at 없이 재조회 (정기 구독 기준만으로 판정)
    const fallback = await baseQuery('status, current_period_end, trial_end');
    if (fallback.error) {
      // 그래도 실패하면 로그인은 살리고 비프리미엄으로 안전 폴백
      return { isPremium: false, status: 'none' };
    }
    data = fallback.data as unknown as SubscriptionRow | null;
  } else {
    data = withExpires.data as unknown as SubscriptionRow | null;
  }

  if (!data) return { isPremium: false, status: 'none' };
  // 단건은 expires_at, 정기는 current_period_end/trial_end 기준
  const periodEnd = data.expires_at || data.current_period_end || data.trial_end;
  const stillValid = periodEnd ? new Date(periodEnd).getTime() > Date.now() : false;
  return {
    isPremium: stillValid,
    status: data.status as PremiumStatus['status'],
    periodEnd: periodEnd ?? undefined,
  };
}

/**
 * 사용자의 기본 차량 유종 조회 — 앱 기본 유종 자동 선택에 사용.
 * 기본 차량이 없으면 null(클라이언트는 기존 B027 유지).
 */
export async function getDefaultProduct(userId?: string): Promise<ProductCode | null> {
  if (!userId || !isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb
    .from('vehicles')
    .select('fuel')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  const fuel = data?.fuel as string | undefined;
  return fuel && fuel in PRODUCT_LABEL ? (fuel as ProductCode) : null;
}

/** 사용자 닉네임 조회 — 세션 주입/표시용. 없으면 null. */
export async function getNickname(userId?: string): Promise<string | null> {
  if (!userId || !isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('nickname').eq('id', userId).maybeSingle();
  return (data?.nickname as string | null) ?? null;
}

/** 사용자 프로필 사진(image_url) 조회 — 세션 주입/표시용. 없으면 null. */
export async function getAvatar(userId?: string): Promise<string | null> {
  if (!userId || !isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('image_url').eq('id', userId).maybeSingle();
  return (data?.image_url as string | null) ?? null;
}

/**
 * 현재 유효한 세션 식별자(users.session_id) 조회 — 1계정 1세션 검증용.
 * 반환 의미:
 *  - string: DB에 기록된 최신 세션 식별자(이 값과 토큰 sid를 비교).
 *  - undefined: 검증 불가(미설정 또는 session_id 컬럼 미적용 환경) → 호출부는 검증을 건너뛴다.
 *  - null이 아닌 undefined를 쓰는 이유: "값이 없음(검증 불가)"과 "다른 세션"을 구분하기 위함.
 */
export async function getSessionId(userId?: string): Promise<string | undefined> {
  if (!userId || !isSupabaseConfigured()) return undefined;
  const sb = getSupabase();
  // 마이그레이션 0019(session_id 추가) 미적용 환경 방어:
  // 컬럼 부재로 select가 에러나면 검증 불가(undefined)로 폴백해 로그인/세션을 깨지 않는다.
  const { data, error } = await sb.from('users').select('session_id').eq('id', userId).maybeSingle();
  if (error) return undefined;
  return (data?.session_id as string | null) ?? undefined;
}

/**
 * 경량 session_id 캐시 — 1계정 1세션 검증을 isPremium(60초)과 분리하면서도
 * jwt 콜백이 매 재검증마다 DB를 때리지 않도록 아주 짧게(기본 3초) 캐싱한다.
 *
 * - 키: userId. 값: 마지막 조회한 session_id(또는 undefined=검증불가)와 조회시각.
 * - 캐시 적중 시 DB 미조회. 만료 시 1회 조회 후 갱신.
 * - 무효화 지연: refetchInterval(10초)·포커스 복귀 트리거와 합쳐도 최대 약 (10초+3초) 수준.
 *   서버 인스턴스 모듈 메모리라 인스턴스별 독립이지만, 인증 검증 용도엔 충분하다.
 */
const SESSION_ID_CACHE_MS = 3_000;
const sessionIdCache = new Map<string, { sid: string | undefined; at: number }>();

export async function getSessionIdCached(userId: string): Promise<string | undefined> {
  const now = Date.now();
  const hit = sessionIdCache.get(userId);
  if (hit && now - hit.at < SESSION_ID_CACHE_MS) return hit.sid;
  const sid = await getSessionId(userId);
  sessionIdCache.set(userId, { sid, at: now });
  return sid;
}
