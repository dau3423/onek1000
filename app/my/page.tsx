import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { SignOutButton } from '@/components/SignOutButton';
import { DeleteAccountButton } from '@/components/account/DeleteAccountButton';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { InstallButton } from '@/components/pwa/InstallButton';
import { ReferralCard } from '@/components/referral/ReferralCard';
import ForecastMiniCard from '@/components/forecast/ForecastMiniCard';
import { BETA_FREE } from '@/lib/flags';
import {
  BadgeSkeleton,
  FavoriteCount,
  ForecastNotifySection,
  ForecastNotifySkeleton,
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

  const userId = session.user.id;
  // 닉네임/이미지는 세션 토큰에 캐시됨 → 별도 DB 대기 없이 즉시 표시.
  const nickname = session.user.nickname ?? null;
  const image = session.user.image ?? null;
  // DB 미설정(또는 세션에 userId 없음) 시엔 데이터 영역 스트리밍을 생략하고 무료 플랜 골격만.
  const canQuery = Boolean(userId) && isSupabaseConfigured();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="font-bold text-gray-900">마이페이지</h1>
      </header>

      <section className="px-5 py-5">
        <ProfileHeader
          initialImage={image}
          initialNickname={nickname}
          fallbackName={session.user.name}
          email={session.user.email}
        />
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">구독</h2>
        {canQuery && userId ? (
          <Suspense fallback={<SubscriptionSkeleton />}>
            <SubscriptionSection userId={userId} />
          </Suspense>
        ) : BETA_FREE ? (
          // [베타 전면무료] DB 미설정/폴백 경로에서도 결제 유도(/pricing) 대신 무료 개방 안내.
          // 플래그 off 시 아래 기존 "₩1,000으로 광고 끄기" CTA로 완전 원복.
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="text-sm text-gray-700">
              지금은 베타 기간이라 <strong>모든 기능을 무료로</strong> 쓸 수 있어요.
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm text-gray-700">현재 무료 플랜이에요.</div>
            <Link
              href="/pricing"
              className="mt-3 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-bold text-white"
            >
              ₩1,000으로 광고 끄기 →
            </Link>
          </div>
        )}
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">친구 추천</h2>
        {/* 코드 lazy 발급/성공수는 클라이언트에서 /api/referral/me로 조회(서버 검증). */}
        <ReferralCard />
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">즐겨찾기</h2>
        <Link href="/my/favorites" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="text-sm text-gray-700">♡ 저장한 주유소</span>
          {canQuery && userId ? (
            <Suspense fallback={<BadgeSkeleton />}>
              <FavoriteCount userId={userId} />
            </Suspense>
          ) : (
            <span className="text-sm font-bold text-gray-900">0개</span>
          )}
        </Link>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">내 기록</h2>
        <Link href="/my/fuel-logs" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="text-sm text-gray-700">⛽⚡ 주유 · 충전 기록</span>
          {canQuery && userId ? (
            <Suspense fallback={<BadgeSkeleton />}>
              <FuelLogCount userId={userId} />
            </Suspense>
          ) : (
            <span className="text-sm text-primary">보기 →</span>
          )}
        </Link>
        {/* 차계부/주유비 리포트 — 모든 회원 무료. 월별 주유비·연비·절약 통계. */}
        <Link href="/my/report" className="mt-2 flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="text-sm text-gray-700">📊 주유 리포트 (월별 · 연비 · 절약)</span>
          <span className="text-sm text-primary">보기 →</span>
        </Link>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">내 차량</h2>
        <Link href="/my/vehicles" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="text-sm text-gray-700">🚗 차량 / 기름 종류</span>
          {canQuery && userId ? (
            <Suspense fallback={<BadgeSkeleton />}>
              <VehicleCount userId={userId} />
            </Suspense>
          ) : (
            <span className="text-sm text-primary">관리 →</span>
          )}
        </Link>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">관심 지역</h2>
        <Link href="/my/interest-regions" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="text-sm text-gray-700">📍 관심 지역 최저가 알림</span>
          {canQuery && userId ? (
            <Suspense fallback={<BadgeSkeleton />}>
              <RegionCount userId={userId} />
            </Suspense>
          ) : (
            <span className="text-sm text-primary">관리 →</span>
          )}
        </Link>
      </section>

      {/* 주유 타이밍 미니카드 — 신호 없으면 자체 null(빈 섹션 미생성). 탭 시 메인 예측 카드 딥링크. */}
      <ForecastMiniCard />

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">알림</h2>
        {/* 프리미엄 판정은 서버에서 DB로 검증한 isActive를 그대로 전달(SEC-5).
            클라 세션(useSession) 갱신 타이밍과 무관하게 결제 직후 즉시 정확하게 반영된다. */}
        {canQuery && userId ? (
          <Suspense fallback={<PushSkeleton />}>
            <PushSection userId={userId} />
          </Suspense>
        ) : (
          <p className="text-xs text-gray-400">푸시 알림은 1000냥 플랜 전용 기능입니다.</p>
        )}
        {/* 주유 타이밍(가격 인상) 예측 알림 옵트인 — 푸시 켠 사용자에게 forecast-notify 배치가 발송. */}
        {canQuery && userId ? (
          <Suspense fallback={<ForecastNotifySkeleton />}>
            <ForecastNotifySection userId={userId} />
          </Suspense>
        ) : null}
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">지원</h2>
        <InstallButton />
        <a
          href="http://pf.kakao.com/_dcnGX/chat"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-between rounded-xl bg-gray-50 p-4"
        >
          <span className="text-sm text-gray-700">💬 1:1 문의 (카카오톡 채널)</span>
          <span className="text-sm text-primary">채팅 열기 →</span>
        </a>
        <a
          href="mailto:junicode0901@gmail.com?subject=%5B1000%EB%83%A5%20%EC%A3%BC%EC%9C%A0%EC%86%8C%5D%20%EB%AC%B8%EC%9D%98"
          className="mt-2 flex items-center justify-between rounded-xl bg-gray-50 p-4"
        >
          <span className="text-sm text-gray-700">✉️ 문의하기</span>
          <span className="text-sm text-primary">이메일 보내기 →</span>
        </a>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-gray-400">
          <Link href="/legal/terms" className="hover:underline">이용약관</Link>
          <Link href="/legal/privacy" className="hover:underline">개인정보처리방침</Link>
          <Link href="/legal/payment" className="hover:underline">유료 결제 이용약관</Link>
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
