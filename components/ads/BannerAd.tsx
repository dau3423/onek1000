'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

declare global {
  interface Window {
    adsbygoogle?: object[];
  }
}

interface Props {
  /** 부모에서 강제로 숨기고 싶을 때 (예: 구독자 즉시 OFF) */
  hide?: boolean;
}

export function BannerAd({ hide }: Props) {
  const { data } = useSession();
  const isPremium = Boolean(data?.user?.isPremium);

  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const slot = process.env.NEXT_PUBLIC_ADSENSE_BANNER_SLOT;
  const ref = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    if (hide || isPremium || !client || !slot) return;
    // adsbygoogle 스크립트가 layout에서 lazy 로드되었다고 가정
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('adsense push fail', e);
    }
  }, [hide, isPremium, client, slot]);

  if (hide || isPremium) return null;

  // AdSense 미설정 → 자체 CTA 폴백
  if (!client || !slot) {
    return (
      <div className="pointer-events-auto absolute inset-x-0 bottom-[72px] z-10 flex justify-center px-3 pb-2">
        <Link
          href="/pricing"
          className="flex w-full max-w-md items-center justify-between rounded-lg bg-gradient-to-r from-primary to-primary-dark px-4 py-2.5 text-white shadow-lg"
        >
          <div>
            <div className="text-[11px] opacity-90">광고가 거슬리신가요?</div>
            <div className="text-sm font-bold">월 1,000원 → 광고 OFF</div>
          </div>
          <span className="text-xs font-bold">자세히 →</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-[72px] z-10 flex justify-center px-3 pb-2">
      <ins
        ref={ref}
        className="adsbygoogle block w-full max-w-md"
        style={{ display: 'block', minHeight: 50 }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
