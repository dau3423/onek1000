'use client';

// 상세 페이지 진입 시 일 1회 표시되는 모달 광고.
// MVP에서는 AdSense interstitial을 직접 호출하지 않고 "자체 CTA + 카운트다운"으로 대체.
// 운영 시 AdSense Interstitial 또는 별도 광고 SDK로 교체 권장.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const STORAGE_KEY = '1000n_interstitial_last';

export function InterstitialAd() {
  const { data, status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [counter, setCounter] = useState(4);

  useEffect(() => {
    // 세션이 확정될 때까지(로딩 중)는 아무 동작도 하지 않는다.
    // 로딩 중 isPremium을 false로 오판해 프리미엄 회원에게 광고가 뜨거나
    // localStorage 일일 플래그가 잘못 기록되는 race를 방지한다.
    if (status === 'loading') return;

    const isPremium = Boolean(data?.user?.isPremium);
    // 프리미엄이면 열지 않고, 이미 열려 있던 광고(로딩 중 → 결제로 프리미엄 전환 등)는 즉시 닫는다.
    if (isPremium) {
      setOpen(false);
      return;
    }

    const last = Number(localStorage.getItem(STORAGE_KEY) || '0');
    const now = Date.now();
    if (now - last < 24 * 60 * 60 * 1000) return;
    localStorage.setItem(STORAGE_KEY, String(now));
    setOpen(true);
  }, [data, status]);

  useEffect(() => {
    if (!open) return;
    if (counter <= 0) return;
    const t = setTimeout(() => setCounter((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [open, counter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center">
        <div className="text-4xl">⛽</div>
        <h2 className="mt-3 text-lg font-bold text-gray-900">1000냥으로 광고 OFF</h2>
        <p className="mt-2 text-sm text-gray-600">월 ₩1,000으로 깔끔하게 — 7일 무료 체험</p>
        <button
          onClick={() => router.push('/pricing')}
          className="mt-5 w-full rounded-xl bg-primary py-3 font-bold text-white"
        >
          1000냥 자세히 보기
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={counter > 0}
          className="mt-2 w-full rounded-xl py-3 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          {counter > 0 ? `${counter}초 후 닫기` : '닫기'}
        </button>
      </div>
    </div>
  );
}
