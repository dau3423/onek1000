'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';

export function Header() {
  const { data, status } = useSession();
  const signedIn = status === 'authenticated';

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-100 bg-white px-4">
      <Link href="/" className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-black text-white">
          1k
        </div>
        <span className="font-bold text-gray-900">1000냥 주유소</span>
      </Link>

      <div className="flex items-center gap-1.5">
        <Link
          href="/search"
          aria-label="검색"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100"
        >
          🔍
        </Link>
        <Link
          href="/route"
          aria-label="경로별 최저가"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100"
          title="경로별 최저가"
        >
          🛣️
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
          aria-label="마이페이지"
          title={data?.user?.email ?? '로그인'}
        >
          {signedIn ? '👤' : '🔑'}
        </Link>
      </div>
    </header>
  );
}
