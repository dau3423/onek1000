'use client';

// AdSense 스크립트는 사용자가 무료 플랜일 때만 lazy 로드.
// 구독자에게는 트래커가 아예 로드되지 않아 페이지 가벼움 + 프라이버시 메리트.

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
      strategy="lazyOnload"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
    />
  );
}
