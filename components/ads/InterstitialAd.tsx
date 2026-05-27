'use client';

// 상세 페이지 진입 시 일 1회 표시되는 모달 광고.
// MVP에서는 AdSense interstitial을 직접 호출하지 않고 "자체 CTA + 카운트다운"으로 대체.
// 운영 시 AdSense Interstitial 또는 별도 광고 SDK로 교체 권장.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const STORAGE_KEY = '1000n_interstitial_last';

export function InterstitialAd() {
  const { data } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [counter, setCounter] = useState(4);

  useEffect(() => {
    const isPremium = Boolean(data?.user?.isPremium);
    if (isPremium) return;
    const last = Number(localStorage.getItem(STORAGE_KEY) || '0');
    const now = Date.now();
    if (now - last < 24 * 60 * 60 * 1000) return;
    localStorage.setItem(STORAGE_KEY, String(now));
    setOpen(true);
  }, [data]);

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
