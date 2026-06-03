'use client';

// AdSense 스크립트는 사용자가 무료 플랜일 때만 로드.
// 구독자에게는 트래커가 아예 로드되지 않아 페이지 가벼움 + 프라이버시 메리트.
// strategy=afterInteractive: 하이드레이션 직후 head에 주입 → AdSense 검증 크롤러/광고 노출 신뢰성↑.

import Script from 'next/script';
import { useSession } from 'next-auth/react';

export function AdsenseScript() {
  const { data } = useSession();
  const isPremium = Boolean(data?.user?.isPremium);
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  if (isPremium || !client) return null;
  return (
    <Script
      id="adsense"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
    />
  );
}
