// 서버 컴포넌트/API Routes에서 세션 조회 헬퍼

import { getServerSession } from 'next-auth';
import { authOptions } from './options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
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
