'use client';

// 포트원(PortOne) v2 결제창 호출.
// 1) PG(이니시스 카드 / 카카오페이) + 단건/정기 선택 → /api/billing/subscribe 가
//    paymentId(단건)/issueId(정기) 발급 + storeId/channelKey 반환(billing_pending 기록).
// 2) 단건=PortOne.requestPayment / 정기=PortOne.requestIssueBillingKey 호출.
//    - PC: Promise 로 결과 수신(code 있으면 실패) → /api/billing/complete 로 확정.
//    - 모바일: redirectUrl(/api/billing/return)로 이동해 서버가 확정.

import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import * as PortOne from '@portone/browser-sdk/v2';

type PlanCode = 'onetime_1000' | 'monthly_1000';
type PgKind = 'inicis' | 'kakaopay';

interface SubscribeResponse {
  ok: boolean;
  recurring: boolean;
  storeId: string;
  channelKey: string;
  paymentId?: string;
  issueId?: string;
  orderName: string;
  amount: number;
  customer: { email: string; name: string };
  error?: string;
}

export function SubscribeButton() {
  const { status } = useSession();
  const [plan, setPlan] = useState<PlanCode>('monthly_1000');
  const [pg, setPg] = useState<PgKind>('inicis');
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
        body: JSON.stringify({ plan, pg }),
      });
      const data = (await res.json()) as SubscribeResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || '결제 시작 실패');

      const origin = window.location.origin;
      const customer = {
        fullName: data.customer.name,
        email: data.customer.email || undefined,
      };

      if (!data.recurring) {
        // ── 단건 결제 ──
        const payMethod = pg === 'kakaopay' ? 'EASY_PAY' : 'CARD';
        const response = await PortOne.requestPayment({
          storeId: data.storeId,
          channelKey: data.channelKey,
          paymentId: data.paymentId!,
          orderName: data.orderName,
          totalAmount: data.amount,
          currency: 'KRW',
          payMethod,
          redirectUrl: `${origin}/api/billing/return`,
          customer,
        });
        // 모바일은 redirect 되어 이 줄에 도달하지 않는다. PC만 여기로.
        if (response?.code) {
          throw new Error(response.message || '결제가 취소되었거나 실패했습니다.');
        }
        await completeAndRedirect({ paymentId: response?.paymentId ?? data.paymentId! });
      } else {
        // ── 정기(빌링키 발급) ──
        const billingKeyMethod = pg === 'kakaopay' ? 'EASY_PAY' : 'CARD';
        // 모바일 redirect 시 issueId 가 쿼리로 돌아오지 않으므로 redirectUrl 에 직접 실어 보낸다.
        const redirectUrl = `${origin}/api/billing/return?issueId=${encodeURIComponent(data.issueId!)}`;
        const response = await PortOne.requestIssueBillingKey({
          storeId: data.storeId,
          channelKey: data.channelKey,
          billingKeyMethod,
          issueId: data.issueId!,
          issueName: data.orderName,
          redirectUrl,
          customer,
        });
        if (response?.code) {
          throw new Error(response.message || '빌링키 발급이 취소되었거나 실패했습니다.');
        }
        if (!response?.billingKey) throw new Error('빌링키를 받지 못했습니다.');
        await completeAndRedirect({ billingKey: response.billingKey, issueId: data.issueId! });
      }
    } catch (e) {
      alert('결제 실패: ' + (e instanceof Error ? e.message : String(e)));
      setLoading(false);
    }
  };

  // PC 결제 성공 후 서버 확정 호출 → 결과 페이지로 이동.
  const completeAndRedirect = async (body: {
    paymentId?: string;
    billingKey?: string;
    issueId?: string;
  }) => {
    const res = await fetch('/api/billing/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; plan?: string; reason?: string };
    if (!res.ok || !data.ok) {
      window.location.href = `/billing/fail?reason=${encodeURIComponent(data.reason || 'confirm')}`;
      return;
    }
    window.location.href = `/billing/success?status=ok&plan=${data.plan ?? plan}`;
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

      {/* 결제 수단(PG) 선택 */}
      <div className="grid grid-cols-2 gap-2">
        <CardPgButton selected={pg === 'inicis'} onSelect={() => setPg('inicis')} />
        <KakaoPgButton selected={pg === 'kakaopay'} onSelect={() => setPg('kakaopay')} />
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

// 요금제 카드: 가격 강조형. 선택 시 주황 테두리 + 연한 주황 배경.
// 다크모드에서도 텍스트가 묻히지 않도록 selected에 dark: 텍스트 색을 명시한다.
function PlanCard({ selected, onSelect, title, price, desc, badge }: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary dark:bg-primary/15'
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
          selected
            ? 'text-primary dark:text-primary'
            : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {title}
      </div>
      <div className="mt-0.5 text-lg font-extrabold text-gray-900 dark:text-gray-100">
        {price}
      </div>
      <div
        className={`mt-1 text-[11px] leading-tight ${
          selected
            ? 'text-gray-600 dark:text-gray-300'
            : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {desc}
      </div>
    </button>
  );
}

interface PgButtonProps {
  selected: boolean;
  onSelect: () => void;
}

// 결제수단: 카드(이니시스). 중립 톤 + 카드 아이콘으로 요금제 카드와 구분.
function CardPgButton({ selected, onSelect }: PgButtonProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary dark:bg-primary/15'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          selected
            ? 'bg-primary text-white'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
        }`}
        aria-hidden
      >
        {/* 카드 아이콘 */}
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6 14.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
          카드 결제
        </span>
        <span className="block text-[11px] leading-tight text-gray-500 dark:text-gray-400">
          신용·체크카드
        </span>
      </span>
    </button>
  );
}

// 결제수단: 카카오페이. 카카오 브랜드 노란색(#FEE500) + 다크 텍스트(#191919).
// 노란 배경+검정 텍스트는 라이트/다크 모드 모두 가독성을 유지한다.
function KakaoPgButton({ selected, onSelect }: PgButtonProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ backgroundColor: '#FEE500' }}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
        selected ? 'border-[#191919] ring-1 ring-[#191919]' : 'border-[#FEE500]'
      }`}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}
        aria-hidden
      >
        {/* 말풍선(카카오 심볼 느낌) 아이콘 */}
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" style={{ color: '#191919' }}>
          <path
            d="M12 4.5c-4.6 0-8.3 2.9-8.3 6.5 0 2.3 1.6 4.3 4 5.5-.2.6-.7 2.2-.8 2.6 0 0 0 .2.1.2.1.1.2 0 .2 0 .3-.2 2.6-1.7 3.4-2.3.4 0 .7.1 1.1.1 4.6 0 8.3-2.9 8.3-6.6S16.6 4.5 12 4.5Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold" style={{ color: '#191919' }}>
          카카오페이
        </span>
        <span
          className="block text-[11px] font-medium leading-tight"
          style={{ color: 'rgba(0,0,0,0.6)' }}
        >
          간편결제
        </span>
      </span>
    </button>
  );
}
