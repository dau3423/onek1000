'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

const boldTag = { b: (chunks: React.ReactNode) => <b>{chunks}</b> };

export default function ForgotPasswordClient() {
  const t = useTranslations('auth');
  const tForgot = useTranslations('auth.forgotPassword');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 보안상 서버는 이메일 존재 여부를 알려주지 않으므로, 성공/실패 구분 없이 "보냈어요" 안내만 표시한다.
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // 네트워크 오류여도 동일 안내(열거 방지·UX 일관성). 사용자는 메일함을 확인하면 된다.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <h1 className="text-xl font-bold text-gray-900">{tForgot('heading')}</h1>

      {sent ? (
        <div className="mt-6 w-full rounded-2xl border border-orange-200 bg-orange-50 p-5 text-center">
          <p className="text-sm font-semibold text-orange-900">{tForgot('sentHeading')}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-orange-800">
            {tForgot.rich('sentBody1', boldTag)}
            <br />
            {tForgot('sentBody2')}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-center text-sm text-gray-500">
            {tForgot('description')}
          </p>
          <form onSubmit={handleSubmit} className="mt-6 w-full space-y-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {submitting ? tForgot('submitting') : tForgot('submitButton')}
            </button>
          </form>
        </>
      )}

      <Link href="/auth/sign-in" className="mt-6 text-[13px] text-gray-500 underline hover:text-gray-700">
        {t('backToSignIn')}
      </Link>
    </main>
  );
}
