import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Suspense } from 'react';
import './globals.css';
import { SessionProvider } from '@/components/SessionProvider';
import { AdsenseScript } from '@/components/ads/AdsenseScript';
import { FirebaseAnalytics } from '@/components/FirebaseAnalytics';

const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-pretendard',
  weight: '45 920',
});

export const metadata: Metadata = {
  title: '1000냥 주유소 - 내 주변 최저가 주유소',
  description: '전국 주유소 실시간 가격을 지도에서 확인하세요. 월 1,000원 광고 제거.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
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
