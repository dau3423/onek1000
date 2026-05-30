'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';

export function Header() {
  const { data, status } = useSession();
  const signedIn = status === 'authenticated';

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-100 bg-white px-4">
      <Link href="/" className="flex items-center gap-2">
        <Image
          src="/icons/app_icon.png"
          alt="1000냥 주유소"
          width={28}
          height={28}
          className="rounded-lg"
          priority
        />
        {/* 모바일은 앱 아이콘만, sm(640px) 이상에서 텍스트 노출 */}
        <span className="hidden font-bold text-gray-900 sm:inline">1000냥 주유소</span>
      </Link>

      <div className="flex items-center gap-1.5">
        <Link
          href="/search"
          aria-label="검색"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100"
        >
          <Image src="/icons/icon_search.png" alt="" width={20} height={20} />
        </Link>
        <Link
          href="/route"
          aria-label="경로별 최저가"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100"
          title="경로별 최저가"
        >
          <Image src="/icons/icon_run.png" alt="" width={20} height={20} />
        </Link>
        {!data?.user?.isPremium && (
          <Link
            href="/pricing"
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-dark"
          >
            ₩1,000 광고 OFF
          </Link>
        )}
        <Link
          href={signedIn ? '/my' : '/auth/sign-in'}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100"
          aria-label={signedIn ? '마이페이지' : '로그인'}
          title={data?.user?.email ?? '로그인'}
        >
          {signedIn ? (
            // 프로필 아이콘 (로그인 상태)
            <Image src="/icons/icon_profile.png" alt="" width={22} height={22} />
          ) : (
            // 로그인 아이콘 (비로그인)
            <Image src="/icons/icon_login.png" alt="" width={22} height={22} />
          )}
        </Link>
      </div>
    </header>
  );
}
