'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SignInInner() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-black text-2xl text-white">
        1k
      </div>
      <h1 className="mt-4 text-xl font-bold text-gray-900">1000냥 주유소</h1>
      <p className="mt-1 text-sm text-gray-500">소셜 계정으로 1초만에 시작</p>

      <div className="mt-8 w-full space-y-2">
        <button
          onClick={() => signIn('kakao', { callbackUrl })}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3.5 font-bold text-[#191919] hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/kakao.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          카카오로 시작하기
        </button>
        <button
          onClick={() => signIn('google', { callbackUrl })}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3.5 font-semibold text-gray-700 hover:bg-gray-50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/google.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          구글로 시작하기
        </button>
      </div>

      <p className="mt-8 text-center text-[11px] text-gray-400">
        로그인하면{' '}
        <Link href="/legal/terms" className="underline">이용약관</Link>
        {' '}및{' '}
        <Link href="/legal/privacy" className="underline">개인정보처리방침</Link>
        에 동의한 것으로 간주됩니다.
      </p>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-gray-500">로딩 중...</div>}>
      <SignInInner />
    </Suspense>
  );
}
