// 마이페이지 영역별 async 서버 컴포넌트 + 스켈레톤.
// 각 영역을 독립적으로 await → <Suspense>로 감싸 골격 즉시 + 영역별 스트리밍(체감 속도 개선).
// user.id는 세션 토큰(session.user.id)에서 바로 사용하므로 users 조회 라운드트립이 없다.

import { cache } from 'react';
import Link from 'next/link';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { CancelButton } from '@/components/billing/CancelButton';
import { EnablePushButton } from '@/components/push/EnablePushButton';
import { ForecastNotifyToggle } from '@/components/forecast/ForecastNotifyToggle';
import { BETA_FREE } from '@/lib/flags';

interface Sub {
  id: string;
  status: string;
  plan: string;
  plan_type: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  expires_at: string | null;
  next_charge_at: string | null;
  canceled_at: string | null;
}

/** 영역 카운트 배지 스켈레톤(짧은 회색 막대). */
function BadgeSkeleton() {
  return <span className="h-4 w-8 animate-pulse rounded bg-gray-200" />;
}

/** 구독 박스 스켈레톤(카드 높이 유지로 레이아웃 점프 방지). */
export function SubscriptionSkeleton() {
  return <div className="h-[92px] animate-pulse rounded-xl bg-gray-100" />;
}

/** 알림 버튼 스켈레톤. */
export function PushSkeleton() {
  return <div className="h-[42px] animate-pulse rounded-lg bg-gray-100" />;
}

/**
 * 구독(프리미엄) 상태 박스. 서버에서 DB로 구독을 조회해 프리미엄 여부를 판정(SEC-5).
 * 알림 버튼이 이 isActive를 필요로 하므로, 판정 로직을 재사용하도록 분리한다.
 */
// SubscriptionSection / PushSection이 같은 조회를 공유 → React cache로 요청당 1회로 합친다.
const fetchSubscription = cache(async (userId: string): Promise<Sub | null> => {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb
    .from('subscriptions')
    .select('id, status, plan, plan_type, current_period_end, trial_end, expires_at, next_charge_at, canceled_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Sub | null;
});

/** 구독 row → 프리미엄 활성 판정(페이지/알림 버튼 공통). */
function deriveStatus(sub: Sub | null) {
  const isOnetime = sub?.plan_type === 'onetime';
  const periodEnd = sub?.expires_at ?? sub?.current_period_end ?? sub?.trial_end;
  const periodEndValid = periodEnd ? new Date(periodEnd).getTime() > Date.now() : false;
  const periodEndStr = periodEnd ? new Date(periodEnd).toLocaleDateString('ko-KR') : null;
  // 정기(trial/active)는 항상, canceled여도 만료 전이면 프리미엄 유지
  const isActive =
    sub?.status === 'active' ||
    sub?.status === 'trial' ||
    (sub?.status === 'canceled' && periodEndValid);
  const isCanceled = sub?.status === 'canceled';
  // 무료 체험(welcome trial 포함): 결제가 없는 상태 → 표시/노출을 별도로 분기한다.
  const isTrial = sub?.status === 'trial';
  return { isOnetime, periodEndStr, isActive, isCanceled, isTrial };
}

export async function SubscriptionSection({ userId }: { userId: string }) {
  const sub = await fetchSubscription(userId);
  const { isOnetime, periodEndStr, isActive, isCanceled, isTrial } = deriveStatus(sub);

  if (sub && isActive) {
    // 라벨/값 분기:
    //  - 무료 체험(trial): "혜택 만료일" + trial 만료일, 가격은 "Free"(결제 없음).
    //  - 단건/해지건: "이용 만료" + 만료일.
    //  - 유료 정기(active): "다음 결제" + 다음 결제일.
    const dateLabel = isTrial ? '혜택 만료일' : isOnetime || isCanceled ? '이용 만료' : '다음 결제';
    const priceLabel = isTrial ? 'Free' : isOnetime ? '₩1,000 / 1개월' : '월 ₩1,000';
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-white">
            {isTrial
              ? '무료 체험 중'
              : isOnetime
                ? '1개월권'
                : isCanceled
                  ? '해지 예정'
                  : '정기 구독'}
          </span>
          <span className="text-xs text-gray-500">{priceLabel}</span>
        </div>
        <div className="mt-3 text-sm text-gray-700">
          {dateLabel}: <strong>{periodEndStr ?? '-'}</strong>
        </div>
        {/* 단건/해지건은 끊을 자동결제가 없고, 무료 체험은 해지할 유료 구독이 아니므로 해지 버튼 미노출 */}
        {!isOnetime && !isCanceled && !isTrial && (
          <div className="mt-4">
            <CancelButton />
          </div>
        )}
      </div>
    );
  }

  // [베타 전면무료] 결제 유도 진입점(/pricing CTA)을 숨기고 무료 개방 안내로 대체.
  // 플래그 off 시 기존 "₩1,000으로 광고 끄기" CTA로 완전 원복.
  if (BETA_FREE) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-white">
            베타 무료
          </span>
          <span className="text-xs text-gray-500">Free</span>
        </div>
        <div className="mt-3 text-sm text-gray-700">
          지금은 베타 기간이라 <strong>모든 기능을 무료로</strong> 쓸 수 있어요.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="text-sm text-gray-700">현재 무료 플랜이에요.</div>
      <Link
        href="/pricing"
        className="mt-3 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-bold text-white"
      >
        ₩1,000으로 광고 끄기 →
      </Link>
    </div>
  );
}

/**
 * 알림(푸시) 버튼 영역. 프리미엄 판정은 서버에서 DB로 검증한 isActive를 그대로 전달(SEC-5).
 * 클라 세션(useSession) 갱신 타이밍과 무관하게 결제 직후 즉시 정확하게 반영된다.
 */
export async function PushSection({ userId }: { userId: string }) {
  const sub = await fetchSubscription(userId);
  const { isActive } = deriveStatus(sub);
  // [베타 전면무료] 로그인 사용자(userId 존재)면 푸시를 개방한다.
  // 푸시 구독 API(/api/push/subscribe)도 session.user.isPremium 검사인데 베타 시 true가 되어 정합.
  // 플래그 off 시 기존 isActive(서버 구독 검증)로 완전 원복.
  const allowPush = BETA_FREE || isActive;
  return <EnablePushButton isPremium={allowPush} />;
}

/** 주유 타이밍 예측 알림 토글 스켈레톤. */
export function ForecastNotifySkeleton() {
  return <div className="mt-2 h-[88px] animate-pulse rounded-xl bg-gray-100" />;
}

/**
 * 주유 타이밍(가격 인상) 예측 알림 옵트인 토글 영역.
 * 서버에서 users.forecast_notify_opt_in 을 조회해 초기값을 전달(0027 미적용 시 기본 false).
 */
export async function ForecastNotifySection({ userId }: { userId: string }) {
  let optIn = false;
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from('users')
      .select('forecast_notify_opt_in')
      .eq('id', userId)
      .maybeSingle();
    optIn = Boolean((data as { forecast_notify_opt_in?: boolean } | null)?.forecast_notify_opt_in);
  }
  return <ForecastNotifyToggle initialOptIn={optIn} />;
}

// NOTE: 카카오 알림톡 수신 토글 + 휴대폰번호 입력 카드(AlimtalkSection/AlimtalkSkeleton)는
// 사용자 대상 알림톡이 유료라 당분간 마이페이지 UI에서 제거했다.
// 백엔드(users.alimtalk_opt_in / users.phone 컬럼, /api/profile 필드)와
// components/profile/AlimtalkToggle.tsx는 재노출 대비로 보존한다.

/** 카운트 단건 조회(에러 시 0 폴백). */
async function countRows(table: string, column: string, userId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const sb = getSupabase();
  const { count } = await sb.from(table).select(column, { count: 'exact', head: true }).eq('user_id', userId);
  return count ?? 0;
}

export async function FavoriteCount({ userId }: { userId: string }) {
  const n = await countRows('favorites', 'station_id', userId);
  return <span className="text-sm font-bold text-gray-900">{n}개</span>;
}

export async function FuelLogCount({ userId }: { userId: string }) {
  const n = await countRows('fuel_logs', 'id', userId);
  return n > 0 ? (
    <span className="text-sm font-bold text-gray-900">{n}개</span>
  ) : (
    <span className="text-sm text-primary">보기 →</span>
  );
}

export async function VehicleCount({ userId }: { userId: string }) {
  const n = await countRows('vehicles', 'id', userId);
  return n > 0 ? (
    <span className="text-sm font-bold text-gray-900">{n}개</span>
  ) : (
    <span className="text-sm text-primary">관리 →</span>
  );
}

export async function RegionCount({ userId }: { userId: string }) {
  const n = await countRows('interest_regions', 'id', userId);
  return n > 0 ? (
    <span className="text-sm font-bold text-gray-900">{n}개</span>
  ) : (
    <span className="text-sm text-primary">관리 →</span>
  );
}

export { BadgeSkeleton };
