'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';

export function Header() {
  const { data, status } = useSession();
  const signedIn = status === 'authenticated';
  const isPremium = Boolean(data?.user?.isPremium);
  // 관리자(ADMIN_EMAILS)로 로그인한 경우에만 노출 — 서버 판정값(session.user.isAdmin)이라 위변조 불가.
  const isAdmin = Boolean(data?.user?.isAdmin);

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-100 bg-white px-4">
      <Link href="/" className="flex min-w-0 items-center gap-2">
        <Image
          src="/icons/app_icon.png"
          alt="1000냥 주유소"
          width={36}
          height={36}
          className="shrink-0 rounded-lg"
          priority
        />
        {/* 모바일 포함 전 화면에서 노출. 좁은 화면에서 아이콘과 겹치지 않게 truncate + 모바일 폰트 축소 */}
        <span className="truncate text-sm font-bold text-gray-900 sm:text-base">1000냥 주유소</span>
      </Link>

      <div className="flex shrink-0 items-center gap-1">
        {/* 관리자 전용 콘솔 진입 — 관리자(ADMIN_EMAILS)에게만 노출. 작은 배지형 링크. */}
        {isAdmin && (
          <Link
            href="/admin"
            aria-label="관리자 콘솔"
            title="관리자 콘솔"
            className="mr-0.5 flex h-7 shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 text-xs font-bold text-primary transition active:scale-95"
          >
            <span aria-hidden>⚙️</span>
            <span className="hidden sm:inline">관리자</span>
          </Link>
        )}
        <Link
          href="/search"
          aria-label="검색"
          className="flex h-12 w-12 items-center justify-center rounded-full"
        >
          <Image src="/icons/icon_search.png" alt="" width={30} height={30} />
        </Link>
        <Link
          href="/route"
          aria-label="경로별 최저가"
          className="flex h-12 w-12 items-center justify-center rounded-full"
          title="경로별 최저가"
        >
          <Image src="/icons/icon_run.png" alt="" width={30} height={30} />
        </Link>
        <Link
          href={signedIn ? '/my' : '/auth/sign-in'}
          className="flex h-12 w-12 items-center justify-center rounded-full"
          aria-label={signedIn ? (isPremium ? '마이페이지 (프리미엄 회원)' : '마이페이지') : '로그인'}
          title={signedIn && isPremium ? '프리미엄 회원' : (data?.user?.email ?? '로그인')}
        >
          {signedIn ? (
            isPremium ? (
              // 프리미엄 회원 아이콘 (유료 구독)
              <Image src="/icons/icon_premium.png" alt="프리미엄 회원" width={32} height={32} />
            ) : (
              // 프로필 아이콘 (일반 로그인 상태)
              <Image src="/icons/icon_profile.png" alt="" width={32} height={32} />
            )
          ) : (
            // 로그인 아이콘 (비로그인)
            <Image src="/icons/icon_login.png" alt="" width={32} height={32} />
          )}
        </Link>
      </div>
    </header>
  );
}
