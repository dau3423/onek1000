'use client';

// 토스페이먼츠 자동결제 인증창 → authKey 콜백 처리
// SDK 동적 로드 후 requestBillingAuth 호출.

import { useEffect, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      requestBillingAuth: (method: 'CARD', opts: {
        customerKey: string;
        successUrl: string;
        failUrl: string;
      }) => Promise<void>;
    };
  }
}

function loadTossScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.TossPayments) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.tosspayments.com/v1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Toss SDK 로드 실패'));
    document.head.appendChild(s);
  });
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'cust-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function SubscribeButton() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const customerKeyRef = useRef<string>('');

  useEffect(() => {
    if (!customerKeyRef.current) {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('1000n_customerKey') : null;
      customerKeyRef.current = stored ?? uuid();
      if (typeof window !== 'undefined') localStorage.setItem('1000n_customerKey', customerKeyRef.current);
    }
  }, []);

  const onClick = async () => {
    if (status !== 'authenticated') {
      signIn(undefined, { callbackUrl: '/pricing' });
      return;
    }
    setLoading(true);
    try {
      await loadTossScript();
      const clientKey = process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY;
      if (!clientKey || !window.TossPayments) throw new Error('Toss 설정 누락');
      const toss = window.TossPayments(clientKey);
      const origin = window.location.origin;
      await toss.requestBillingAuth('CARD', {
        customerKey: customerKeyRef.current,
        successUrl: `${origin}/billing/success?customerKey=${customerKeyRef.current}`,
        failUrl: `${origin}/billing/fail`,
      });
    } catch (e) {
      alert('결제 시작 실패: ' + (e instanceof Error ? e.message : String(e)));
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={loading || status === 'loading'}
      className="w-full rounded-xl bg-primary py-3.5 font-bold text-white shadow-md transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? '결제 창 여는 중...' : status === 'authenticated' ? '1000냥으로 시작하기' : '로그인 후 시작하기'}
    </button>
  );
}
