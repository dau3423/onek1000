// 토스 빌링 인증 성공 콜백 — authKey + customerKey를 /api/billing/subscribe로 전달
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

function SuccessInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const authKey = params.get('authKey');
    const customerKey = params.get('customerKey');
    if (!authKey || !customerKey) {
      setState('fail');
      setMessage('인증 정보가 누락되었습니다.');
      return;
    }
    fetch('/api/billing/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey, customerKey }),
    })
      .then(async (r) => {
        if (r.ok) { setState('ok'); setTimeout(() => router.push('/my'), 1500); }
        else { const j = await r.json(); setState('fail'); setMessage(j.error ?? '구독 처리 실패'); }
      })
      .catch((e) => { setState('fail'); setMessage(String(e)); });
  }, [params, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      {state === 'loading' && (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-gray-600">구독을 확정하고 있어요…</p>
        </>
      )}
      {state === 'ok' && (
        <>
          <div className="text-5xl">🎉</div>
          <h1 className="text-xl font-bold">1000냥 시작!</h1>
          <p className="text-sm text-gray-500">7일 무료 체험이 시작됐어요. 마이페이지로 이동합니다.</p>
        </>
      )}
      {state === 'fail' && (
        <>
          <div className="text-5xl">😢</div>
          <h1 className="text-xl font-bold">구독 처리에 실패했어요</h1>
          <p className="text-sm text-gray-500">{message}</p>
          <a href="/pricing" className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">다시 시도</a>
        </>
      )}
    </main>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-gray-500">로딩 중...</div>}>
      <SuccessInner />
    </Suspense>
  );
}
