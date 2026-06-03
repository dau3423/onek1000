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

import { useEffect, useState } from 'react';
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

// 휴대폰 번호: 하이픈/공백 제거 후 숫자만 추출. 010으로 시작하는 10~11자리만 허용.
// (이니시스 V2 일반결제·빌링키 발급 모두 customer.phoneNumber 필수)
function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}
function isValidPhone(digits: string): boolean {
  return /^01[016789][0-9]{7,8}$/.test(digits);
}

// 모바일(redirect 결제) 환경 판정. PortOne v2는 모바일에서 redirectUrl로 페이지 이동하므로
// requestPayment 호출 후 정상 흐름이면 이 컴포넌트로 돌아오지 않는다(=Promise 미반환).
// UA 기반 best-effort 판정(서버 추측 없이 클라에서만 사용).
function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function SubscribeButton() {
  const { status } = useSession();
  const [plan, setPlan] = useState<PlanCode>('monthly_1000');
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  // 결제창 호출 자체가 실패했을 때(예: 모바일 redirect 미발생) 화면에 노출할 메시지.
  const [payError, setPayError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  // 결제수단은 이니시스 카드 단일 고정.
  const pg = 'inicis' as const;

  useEffect(() => {
    setIsMobile(detectMobile());
  }, []);

  const startPay = async () => {
    setPayError('');
    if (status !== 'authenticated') {
      signIn(undefined, { callbackUrl: '/pricing' });
      return;
    }
    // 이니시스 V2는 구매자 휴대폰 번호가 필수 → 결제창 호출 전에 검증/차단.
    const phoneDigits = normalizePhone(phone);
    if (!isValidPhone(phoneDigits)) {
      setPhoneError('휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)');
      return;
    }
    setPhoneError('');
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
        // 이니시스 V2 필수: 하이픈 없는 숫자 형식(01012345678).
        phoneNumber: phoneDigits,
      };

      if (!data.recurring) {
        // ── 단건 결제 (이니시스 카드 통합창) ──
        // 모바일은 redirectUrl로 페이지 이동(redirect)된다. forceRedirect:true 로
        // 모바일에서 popup/inline 시도(팝업 차단 위험) 대신 확실히 redirect 하도록 강제한다.
        // PC는 forceRedirect 무관하게 통합창(popup/iframe) → Promise 로 결과 수신.
        const response = await PortOne.requestPayment({
          storeId: data.storeId,
          channelKey: data.channelKey,
          paymentId: data.paymentId!,
          orderName: data.orderName,
          totalAmount: data.amount,
          currency: 'KRW',
          payMethod: 'CARD',
          redirectUrl: `${origin}/api/billing/return`,
          ...(isMobile ? { forceRedirect: true } : {}),
          customer,
        });
        // 모바일은 redirect 되어 이 줄에 도달하지 않는다(정상). PC만 여기로.
        // 모바일에서 redirect 없이 여기 도달하면(=결제창 미진입) 아래 가드가 메시지를 노출한다.
        if (response?.code) {
          throw new Error(response.message || '결제가 취소되었거나 실패했습니다.');
        }
        if (!response?.paymentId && !data.paymentId) {
          throw new Error('결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
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
          ...(isMobile ? { forceRedirect: true } : {}),
          customer,
        });
        if (response?.code) {
          throw new Error(response.message || '빌링키 발급이 취소되었거나 실패했습니다.');
        }
        if (!response?.billingKey) throw new Error('빌링키를 받지 못했습니다.');
        await completeAndRedirect({ billingKey: response.billingKey, issueId: data.issueId! });
      }
    } catch (e) {
      // 모바일에서 redirect가 정상 발생하면 이 코드는 실행되지 않는다(페이지 이동).
      // 여기 도달했다는 건 결제창 진입 전/직후 실패 → 화면에 원인을 노출(모바일은 alert가
      // 가려지거나 빠르게 사라질 수 있으므로 인라인 메시지를 함께 둔다).
      const msg = e instanceof Error ? e.message : String(e);
      setPayError(msg);
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

      {/* 휴대폰 번호 입력: 이니시스 V2 결제 필수 항목.
          소셜로그인에선 번호를 받지 못하므로 결제 직전에 입력받는다. */}
      <div>
        <label htmlFor="billing-phone" className="mb-1 block text-xs font-semibold text-gray-700">
          휴대폰 번호 <span className="text-primary">*</span>
        </label>
        <input
          id="billing-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (phoneError) setPhoneError('');
          }}
          placeholder="010-1234-5678"
          maxLength={13}
          aria-invalid={phoneError ? true : undefined}
          className={`w-full rounded-xl border px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
            phoneError
              ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
              : 'border-gray-200 focus:border-primary focus:ring-primary'
          }`}
        />
        {phoneError ? (
          <p className="mt-1 text-[11px] leading-tight text-red-500">{phoneError}</p>
        ) : (
          <p className="mt-1 text-[11px] leading-tight text-gray-500">
            결제 진행을 위해 필요합니다. 결제 외 용도로 사용하지 않습니다.
          </p>
        )}
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

      {/* 결제창 진입 실패 메시지(모바일에서 alert가 가려질 수 있어 인라인으로도 노출) */}
      {payError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-tight text-red-600"
        >
          결제를 시작하지 못했어요: {payError}
        </p>
      )}
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
