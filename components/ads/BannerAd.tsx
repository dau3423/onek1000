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

/**
 * 배너 레이아웃 상수 (단일 출처).
 * GPS 버튼 등 배너 위치에 맞춰 떠야 하는 요소가 동일 값을 참조한다.
 */
/** 배너 컨테이너의 맵 하단 기준 bottom 오프셋(px) — 시트 peek 위에 얹힌다 */
export const BANNER_BOTTOM_PX = 72;
/** 배너 컨테이너의 시각적 높이(px) — minHeight(50) + pb-2(8) 여유 포함 */
export const BANNER_HEIGHT_PX = 58;

/**
 * 현재 세션에서 배너가 실제로 보이는지 여부.
 * GPS 버튼 위치 계산이 BannerAd와 동일한 표시 조건을 공유하도록 훅으로 제공한다.
 */
export function useBannerVisible(hide?: boolean): boolean {
  const { data } = useSession();
  const isPremium = Boolean(data?.user?.isPremium);
  return !hide && !isPremium;
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
  // bottom-[72px] = BANNER_BOTTOM_PX. Tailwind JIT 정적 스캔을 위해 리터럴 유지(상수와 동일).
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
