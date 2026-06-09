import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Suspense } from 'react';
import './globals.css';
import { SessionProvider } from '@/components/SessionProvider';
import { SessionGuard } from '@/components/SessionGuard';
import { ReferralClaim } from '@/components/referral/ReferralClaim';
import { AdsenseScript } from '@/components/ads/AdsenseScript';
import { FirebaseAnalytics } from '@/components/FirebaseAnalytics';

const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-pretendard',
  weight: '45 920',
});

// Google AdSense 사이트 소유 확인용 publisher ID (env 우선, 없으면 하드코딩 폴백)
const ADSENSE_ACCOUNT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-6206539456344377';

const SITE_TITLE = '1000냥 주유소 - 내 주변 최저가 주유소';
const SITE_DESCRIPTION =
  '전국 주유소 최저가를 한눈에. 내 주변·경로별 최저가, 가격 하락 알림까지.';

export const metadata: Metadata = {
  // 상대 경로(opengraph-image 등)를 절대 URL로 변환하는 기준. OG/트위터 이미지가 절대화돼야 SNS가 인식.
  metadataBase: new URL('https://onek1000.kr'),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  // 링크 공유 미리보기(카톡/페이스북 등). images는 명시하지 않아 app/opengraph-image.tsx가 자동 연결된다
  // (앱 아이콘이 og:image로 빠지지 않도록 OG 이미지는 별도 카드로 유지).
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: 'https://onek1000.kr',
    siteName: '1000냥 주유소',
    locale: 'ko_KR',
    type: 'website',
  },
  // X(트위터) 공유 카드. images 미명시 → app/twitter-image.tsx가 자동 연결된다.
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // AdSense 사이트 소유 확인 meta (로그인/프리미엄 여부와 무관하게 모든 페이지 head에 노출)
  other: {
    'google-adsense-account': ADSENSE_ACCOUNT,
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#FF6B00',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="h-full">
        <SessionProvider>
          <SessionGuard />
          <ReferralClaim />
          {children}
          <AdsenseScript />
          <Suspense fallback={null}>
            <FirebaseAnalytics />
          </Suspense>
        </SessionProvider>
      </body>
    </html>
  );
}
