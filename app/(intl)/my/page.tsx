import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth/options';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { BackButton } from '@/components/common/BackButton';
import {
  BoltIcon,
  CarIcon,
  ChartIcon,
  ChatIcon,
  ChevronRightIcon,
  FuelIcon,
  HeartIcon,
  MailIcon,
  PhoneIcon,
  PinIcon,
} from '@/components/icons';
import { SignOutButton } from '@/components/SignOutButton';
import { DeleteAccountButton } from '@/components/account/DeleteAccountButton';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { InstallButton } from '@/components/pwa/InstallButton';
import { ReferralCard } from '@/components/referral/ReferralCard';
import ForecastMiniCard from '@/components/forecast/ForecastMiniCard';
// [구독 섹션 재노출] 결제/구독 진입점(/pricing CTA)을 다시 노출한다(앱·결제 심사용).
// BETA_FREE 자체는 끄지 않는다(광고 OFF·헤더 배지 숨김·프리미엄 게이팅 등 다른 동작 유지).
// → 마이페이지의 결제 CTA만 노출되도록 sections.tsx의 비구독 fallback을 CTA로 분기한다.
import {
  BadgeSkeleton,
  FavoriteCount,
  ForecastNotifySection,
  ForecastNotifySkeleton,
  CarwashNotifySection,
  CarwashNotifySkeleton,
  FuelLogCount,
  PushSection,
  PushSkeleton,
  RegionCount,
  SubscriptionSection,
  SubscriptionSkeleton,
  VehicleCount,
} from './sections';

// 마이페이지는 세션 체크만 한 뒤 골격을 즉시 렌더한다.
// 데이터가 필요한 영역(구독/카운트/알림)은 각각 async 서버 컴포넌트로 분리하고
// <Suspense>로 감싸 영역별로 스트리밍한다 → 한 영역이 느려도 골격/다른 영역은 안 막힌다.
// user.id는 세션 토큰(session.user.id)에서 바로 쓰므로 users 조회 라운드트립이 없다.
export default async function MyPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/sign-in?callbackUrl=/my');
  const t = await getTranslations('my');

  const userId = session.user.id;
  // 닉네임/이미지는 세션 토큰에 캐시됨 → 별도 DB 대기 없이 즉시 표시.
  const nickname = session.user.nickname ?? null;
  const image = session.user.image ?? null;
  // DB 미설정(또는 세션에 userId 없음) 시엔 데이터 영역 스트리밍을 생략하고 무료 플랜 골격만.
  const canQuery = Boolean(userId) && isSupabaseConfigured();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton href="/" ariaLabel={t('homeAria')} />
        <h1 className="font-bold text-gray-900">{t('title')}</h1>
      </header>

      <section className="px-5 py-5">
        <ProfileHeader
          initialImage={image}
          initialNickname={nickname}
          fallbackName={session.user.name}
          email={session.user.email}
        />
      </section>

      {/* [구독 섹션 재노출] 결제 진입점(/pricing CTA)을 노출한다(앱·결제 심사용).
          - 로그인+DB 가능: SubscriptionSection이 구독자=상태카드, 비구독=결제 CTA를 렌더.
          - DB 미설정/폴백 경로: BETA_FREE 여부와 무관하게 항상 결제 CTA를 노출(심사 요건).
          비노출이 다시 필요하면 이 <section> 전체를 JSX 주석으로 감싸면 된다(코드 보존). */}
      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('adBlockHeading')}</h2>
        {canQuery && userId ? (
          <Suspense fallback={<SubscriptionSkeleton />}>
            <SubscriptionSection userId={userId} />
          </Suspense>
        ) : (
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm text-gray-700">{t('adShownNotice')}</div>
            <Link
              href="/pricing"
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white"
            >
              {t('adBlockCta')}
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('referralHeading')}</h2>
        {/* 코드 lazy 발급/성공수는 클라이언트에서 /api/referral/me로 조회(서버 검증). */}
        <ReferralCard />
      </section>

      {/* 긴급출동 — 평소에 한 번 보고 보험사를 저장해 두면, 정작 급할 때 목록을 훑지 않아도 된다.
          그래서 자주 여는 마이페이지 위쪽에 둔다(설치형 PWA 는 홈 아이콘 길게 눌러 바로 진입). */}
      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('emergencyHeading')}</h2>
        <Link href="/emergency" className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 p-4">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-orange-900">
            <PhoneIcon className="h-4 w-4 text-primary" />{t('emergencyLabel')}
          </span>
          <ChevronRightIcon className="h-4 w-4 text-orange-300" />
        </Link>
        <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">{t('emergencyHint')}</p>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('favoritesHeading')}</h2>
        <Link href="/my/favorites" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <HeartIcon className="h-4 w-4 text-gray-500" />{t('favoritesLabel')}
          </span>
          {canQuery && userId ? (
            <Suspense fallback={<BadgeSkeleton />}>
              <FavoriteCount userId={userId} />
            </Suspense>
          ) : (
            <span className="text-sm font-bold text-gray-900">{t('countBadge', { count: 0 })}</span>
          )}
        </Link>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('myRecordsHeading')}</h2>
        <Link href="/my/fuel-logs" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <span className="flex items-center gap-1">
              <FuelIcon className="h-4 w-4 text-gray-500" />
              <BoltIcon className="h-4 w-4 text-gray-500" />
            </span>
            {t('fuelChargeLogLabel')}
          </span>
          {canQuery && userId ? (
            <Suspense fallback={<BadgeSkeleton />}>
              <FuelLogCount userId={userId} />
            </Suspense>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-sm text-primary">
              {t('viewAction')}<ChevronRightIcon className="h-3.5 w-3.5" />
            </span>
          )}
        </Link>
        {/* 차계부/주유비 리포트 — 모든 회원 무료. 월별 주유비·연비·절약 통계. */}
        <Link href="/my/report" className="mt-2 flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <ChartIcon className="h-4 w-4 text-gray-500" />{t('fuelReportLinkLabel')}
          </span>
          <span className="inline-flex items-center gap-0.5 text-sm text-primary">
            {t('viewAction')}<ChevronRightIcon className="h-3.5 w-3.5" />
          </span>
        </Link>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('myVehicleHeading')}</h2>
        <Link href="/my/vehicles" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <CarIcon className="h-4 w-4 text-gray-500" />{t('vehicleFuelTypeLabel')}
          </span>
          {canQuery && userId ? (
            <Suspense fallback={<BadgeSkeleton />}>
              <VehicleCount userId={userId} />
            </Suspense>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-sm text-primary">
              {t('manageAction')}<ChevronRightIcon className="h-3.5 w-3.5" />
            </span>
          )}
        </Link>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('interestRegionHeading')}</h2>
        <Link href="/my/interest-regions" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <PinIcon className="h-4 w-4 text-gray-500" />{t('interestRegionAlertLabel')}
          </span>
          {canQuery && userId ? (
            <Suspense fallback={<BadgeSkeleton />}>
              <RegionCount userId={userId} />
            </Suspense>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-sm text-primary">
              {t('manageAction')}<ChevronRightIcon className="h-3.5 w-3.5" />
            </span>
          )}
        </Link>
      </section>

      {/* 주유 타이밍 미니카드 — 신호 없으면 자체 null(빈 섹션 미생성). 탭 시 메인 예측 카드 딥링크. */}
      <ForecastMiniCard />

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('notificationHeading')}</h2>
        {/* 프리미엄 판정은 서버에서 DB로 검증한 isActive를 그대로 전달(SEC-5).
            클라 세션(useSession) 갱신 타이밍과 무관하게 결제 직후 즉시 정확하게 반영된다. */}
        {canQuery && userId ? (
          <Suspense fallback={<PushSkeleton />}>
            <PushSection userId={userId} />
          </Suspense>
        ) : (
          <p className="text-xs text-gray-400">{t('pushLoginHint')}</p>
        )}
        {/* 주유 타이밍(가격 인상) 예측 알림 옵트인 — 푸시 켠 사용자에게 forecast-notify 배치가 발송. */}
        {canQuery && userId ? (
          <Suspense fallback={<ForecastNotifySkeleton />}>
            <ForecastNotifySection userId={userId} />
          </Suspense>
        ) : null}
        {/* 세차 지수 알림 옵트인 — 푸시 켠 사용자에게 carwash-notify 배치가 발송. */}
        {canQuery && userId ? (
          <Suspense fallback={<CarwashNotifySkeleton />}>
            <CarwashNotifySection userId={userId} />
          </Suspense>
        ) : null}
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('supportHeading')}</h2>
        <InstallButton />
        <a
          href="http://pf.kakao.com/_dcnGX/chat"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-between rounded-xl bg-gray-50 p-4"
        >
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <ChatIcon className="h-4 w-4 text-gray-500" />{t('kakaoChatLabel')}
          </span>
          <span className="inline-flex items-center gap-0.5 text-sm text-primary">
            {t('chatOpenAction')}<ChevronRightIcon className="h-3.5 w-3.5" />
          </span>
        </a>
        <a
          href="mailto:junicode0901@gmail.com?subject=%5B1000%EB%83%A5%20%EC%A3%BC%EC%9C%A0%EC%86%8C%5D%20%EB%AC%B8%EC%9D%98"
          className="mt-2 flex items-center justify-between rounded-xl bg-gray-50 p-4"
        >
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <MailIcon className="h-4 w-4 text-gray-500" />{t('contactLabel')}
          </span>
          <span className="inline-flex items-center gap-0.5 text-sm text-primary">
            {t('emailSendAction')}<ChevronRightIcon className="h-3.5 w-3.5" />
          </span>
        </a>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-gray-400">
          <Link href="/legal/terms" className="hover:underline">{t('termsLink')}</Link>
          <Link href="/legal/privacy" className="hover:underline">{t('privacyLink')}</Link>
          <Link href="/legal/payment" className="hover:underline">{t('paymentTermsLink')}</Link>
        </div>
      </section>

      <section className="mt-auto border-t border-gray-100 px-5 py-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <SignOutButton />
        <div className="mt-4">
          <DeleteAccountButton />
        </div>
      </section>
    </main>
  );
}
