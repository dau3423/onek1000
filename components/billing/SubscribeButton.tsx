'use client';

// KG이니시스 표준결제창(INIStdPay) 호출.
// 1) 단건/정기 선택 → /api/billing/subscribe 가 oid + 결제창 폼 필드 반환(서명은 서버 생성)
// 2) 숨김 폼에 필드 주입 → INIStdPay.js 로드 → INIStdPay.pay(formId)
// 3) 인증 완료 후 KG이니시스가 returnUrl(/billing/success)로 결과 POST → 서버 승인요청으로 확정

import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';

declare global {
  interface Window {
    INIStdPay?: { pay: (formId: string) => void };
  }
}

const FORM_ID = 'inicis_stdpay_form';

function loadInicisScript(src: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.INIStdPay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('INIStdPay 로드 실패')));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('INIStdPay 로드 실패'));
    document.head.appendChild(s);
  });
}

type PlanCode = 'onetime_1000' | 'monthly_1000';

export function SubscribeButton() {
  const { status } = useSession();
  const [plan, setPlan] = useState<PlanCode>('monthly_1000');
  const [loading, setLoading] = useState(false);

  const startPay = async () => {
    if (status !== 'authenticated') {
      signIn(undefined, { callbackUrl: '/pricing' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '결제 시작 실패');

      const { scriptUrl, fields } = data as {
        scriptUrl: string;
        fields: Record<string, string>;
      };

      // 결제창이 제출할 숨김 폼 구성 (action/method는 INIStdPay.js가 설정)
      let form = document.getElementById(FORM_ID) as HTMLFormElement | null;
      if (form) form.remove();
      form = document.createElement('form');
      form.id = FORM_ID;
      form.method = 'POST';
      form.style.display = 'none';
      for (const [k, v] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = k;
        input.id = k; // INIStdPay가 id로 일부 값을 참조
        input.value = v ?? '';
        form.appendChild(input);
      }
      document.body.appendChild(form);

      await loadInicisScript(scriptUrl);
      if (!window.INIStdPay) throw new Error('결제 모듈 초기화 실패');
      window.INIStdPay.pay(FORM_ID);
    } catch (e) {
      alert('결제 시작 실패: ' + (e instanceof Error ? e.message : String(e)));
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <PlanCard
          selected={plan === 'monthly_1000'}
          onSelect={() => setPlan('monthly_1000')}
          badge="7일 무료"
          title="정기 구독"
          price="월 ₩1,000"
          desc="7일 무료 후 매월 자동결제"
        />
        <PlanCard
          selected={plan === 'onetime_1000'}
          onSelect={() => setPlan('onetime_1000')}
          title="1개월권"
          price="₩1,000"
          desc="1회 결제 · 1개월 후 만료"
        />
      </div>

      <button
        onClick={startPay}
        disabled={loading || status === 'loading'}
        className="w-full rounded-xl bg-primary py-3.5 font-bold text-white shadow-md transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? '결제 창 여는 중...'
          : status === 'authenticated'
            ? plan === 'monthly_1000'
              ? '7일 무료 후 월 ₩1,000 시작하기'
              : '₩1,000 결제하고 시작하기'
            : '로그인 후 시작하기'}
      </button>
    </div>
  );
}

interface PlanCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  desc: string;
  badge?: string;
}

function PlanCard({ selected, onSelect, title, price, desc, badge }: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
      }`}
    >
      {badge && (
        <span className="absolute -top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
      <div
        className={`text-xs font-semibold ${
          selected ? 'text-gray-500' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {title}
      </div>
      <div
        className={`mt-0.5 text-lg font-extrabold ${
          selected ? 'text-gray-900' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {price}
      </div>
      <div
        className={`mt-1 text-[11px] leading-tight ${
          selected ? 'text-gray-500' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {desc}
      </div>
    </button>
  );
}
