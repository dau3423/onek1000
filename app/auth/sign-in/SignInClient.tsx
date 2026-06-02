'use client';

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function SignInInner({ reviewerLoginEnabled }: { reviewerLoginEnabled: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const callbackUrl = params.get('callbackUrl') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleReviewerLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    setSubmitting(false);
    if (res?.error || !res?.ok) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      return;
    }
    router.push(callbackUrl);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <Image
        src="/icons/app_icon.png"
        alt="1000냥 주유소"
        width={64}
        height={64}
        className="rounded-2xl"
        priority
      />
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

      {reviewerLoginEnabled && (
        <div className="mt-6 w-full">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] text-gray-400">심사용 로그인</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <form onSubmit={handleReviewerLogin} className="mt-3 space-y-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              autoComplete="username"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
            />
            {error && <p className="text-[12px] text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {submitting ? '로그인 중...' : '심사용 로그인'}
            </button>
          </form>
        </div>
      )}

      <p className="mt-8 text-center text-[11px] text-gray-400">
        로그인하면{' '}
        <Link href="/legal/terms" className="underline">이용약관</Link>
        {', '}
        <Link href="/legal/privacy" className="underline">개인정보처리방침</Link>
        {' '}및{' '}
        <Link href="/legal/payment" className="underline">유료 결제 이용약관</Link>
        에 동의한 것으로 간주됩니다.
      </p>

      <a
        href="http://pf.kakao.com/_dcnGX/chat"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 text-center text-[12px] text-gray-500 underline hover:text-gray-700"
      >
        로그인에 문제가 있나요? 1:1 문의 (카카오톡 채널)
      </a>
    </main>
  );
}

export default function SignInClient({ reviewerLoginEnabled }: { reviewerLoginEnabled: boolean }) {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-gray-500">로딩 중...</div>}>
      <SignInInner reviewerLoginEnabled={reviewerLoginEnabled} />
    </Suspense>
  );
}
