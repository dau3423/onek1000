'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? '처리 중 오류가 발생했습니다. 다시 시도해 주세요.');
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  // 토큰 없이 직접 접근한 경우 안내.
  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-bold text-gray-900">유효하지 않은 링크</h1>
        <p className="mt-2 text-sm text-gray-500">재설정 링크가 올바르지 않습니다. 다시 요청해 주세요.</p>
        <Link href="/auth/forgot-password" className="mt-6 text-[13px] text-orange-600 underline">
          비밀번호 찾기로 가기
        </Link>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-bold text-gray-900">비밀번호가 변경되었어요</h1>
        <p className="mt-2 text-sm text-gray-500">새 비밀번호로 다시 로그인해 주세요.</p>
        <button
          onClick={() => router.push('/auth/sign-in')}
          className="mt-6 w-full max-w-xs rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
        >
          로그인하러 가기
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <h1 className="text-xl font-bold text-gray-900">새 비밀번호 설정</h1>
      <p className="mt-1 text-center text-sm text-gray-500">새로 사용할 비밀번호를 입력해 주세요.</p>

      <form onSubmit={handleSubmit} className="mt-6 w-full space-y-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="새 비밀번호 (8자 이상)"
          autoComplete="new-password"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="새 비밀번호 확인"
          autoComplete="new-password"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
        />
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {submitting ? '변경 중...' : '비밀번호 변경'}
        </button>
      </form>

      <Link href="/auth/sign-in" className="mt-6 text-[13px] text-gray-500 underline hover:text-gray-700">
        로그인으로 돌아가기
      </Link>
    </main>
  );
}

export default function ResetPasswordClient() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-gray-500">로딩 중...</div>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
