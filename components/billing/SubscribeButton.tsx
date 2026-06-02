'use client';

// 포트원(PortOne) v2 결제창 호출.
// 1) 요금제(단건/정기) 선택 → /api/billing/subscribe 가
//    paymentId(단건)/issueId(정기) 발급 + storeId/channelKey 반환(billing_pending 기록).
// 2) 단건=PortOne.requestPayment / 정기=PortOne.requestIssueBillingKey 호출.
//    - PC: Promise 로 결과 수신(code 있으면 실패) → /api/billing/complete 로 확정.
//    - 모바일: redirectUrl(/api/billing/return)로 이동해 서버가 확정.
//
// 결제수단: 이니시스(KG이니시스) 카드 통합결제창 단일. 카카오페이 간편결제는
// 이니시스 통합창 안에서 제공되므로 별도 PG 선택을 두지 않는다(pg=inicis 고정, CARD).

import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import * as PortOne from '@portone/browser-sdk/v2';

type PlanCode = 'onetime_1000' | 'monthly_1000';

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
  const [loading, setLoading] = useState(false);
  // 결제수단은 이니시스 카드 단일 고정.
  const pg = 'inicis' as const;

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
        // ── 단건 결제 (이니시스 카드 통합창) ──
        const response = await PortOne.requestPayment({
          storeId: data.storeId,
          channelKey: data.channelKey,
          paymentId: data.paymentId!,
          orderName: data.orderName,
          totalAmount: data.amount,
          currency: 'KRW',
          payMethod: 'CARD',
          redirectUrl: `${origin}/api/billing/return`,
          customer,
        });
        // 모바일은 redirect 되어 이 줄에 도달하지 않는다. PC만 여기로.
        if (response?.code) {
          throw new Error(response.message || '결제가 취소되었거나 실패했습니다.');
        }
        await completeAndRedirect({ paymentId: response?.paymentId ?? data.paymentId! });
      } else {
        // ── 정기(빌링키 발급, 이니시스 카드) ──
        // 모바일 redirect 시 issueId 가 쿼리로 돌아오지 않으므로 redirectUrl 에 직접 실어 보낸다.
        const redirectUrl = `${origin}/api/billing/return?issueId=${encodeURIComponent(data.issueId!)}`;
        const response = await PortOne.requestIssueBillingKey({
          storeId: data.storeId,
          channelKey: data.channelKey,
          billingKeyMethod: 'CARD',
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

      {/* 결제 수단 안내: 이니시스 카드 통합결제창 단일(선택 토글 없음) */}
      <PayMethodNotice />

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

// 요금제 카드: 가격 강조형. 선택 강조는 "텍스트 색"이 아니라
// 테두리(primary ring/border) + 배지 + 체크 아이콘으로 표현한다.
// 연한 주황 배경(bg-primary/5) 위에 주황 글씨를 올리면 대비가 깨지므로,
// 제목/가격/설명은 selected 여부와 무관하게 항상 본문 가독 색을 쓴다.
function PlanCard({ selected, onSelect, title, price, desc, badge }: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-gray-200 bg-white'
      }`}
    >
      {badge && (
        <span className="absolute -top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-1">
        {/* 선택 강조는 색이 아닌 체크 아이콘으로 — 색각 의존 회피 */}
        {selected && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-primary" aria-hidden>
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 0 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
        )}
        <span className="text-xs font-semibold text-gray-700">{title}</span>
      </div>
      <div className="mt-0.5 text-lg font-extrabold text-gray-900">
        {price}
      </div>
      <div className="mt-1 text-[11px] leading-tight text-gray-600">
        {desc}
      </div>
    </button>
  );
}

// 결제수단 안내(비대화형): 이니시스 카드 통합결제창 단일.
// 선택지가 하나뿐이라 토글 대신 고정 안내로 표시한다.
// 카카오페이 등 간편결제는 이니시스 통합창 안에서 제공된다.
function PayMethodNotice() {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"
      role="note"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white"
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
        <span className="block text-sm font-semibold text-gray-900">
          카드 결제
        </span>
        <span className="block text-[11px] leading-tight text-gray-500">
          신용·체크카드 · 카카오페이 등 간편결제
        </span>
      </span>
    </div>
  );
}
