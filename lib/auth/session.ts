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

/** 사용자 구독 상태 조회 — 광고 노출 분기에 사용 */
export async function getPremiumStatus(userId?: string): Promise<PremiumStatus> {
  if (!userId || !isSupabaseConfigured()) return { isPremium: false, status: 'none' };
  const sb = getSupabase();
  const { data } = await sb
    .from('subscriptions')
    .select('status, current_period_end, trial_end')
    .eq('user_id', userId)
    .in('status', ['trial', 'active'])
    .maybeSingle();
  if (!data) return { isPremium: false, status: 'none' };
  const periodEnd = data.current_period_end || data.trial_end;
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
