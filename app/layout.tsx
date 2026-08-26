import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { SessionProvider } from '@/components/SessionProvider';
import { SessionGuard } from '@/components/SessionGuard';
import { LoginResultTracker } from '@/components/auth/LoginResultTracker';
import { ReferralClaim } from '@/components/referral/ReferralClaim';
import { AdsenseScript } from '@/components/ads/AdsenseScript';
import { FirebaseAnalytics } from '@/components/FirebaseAnalytics';
import { VisitPing } from '@/components/VisitPing';

// 폰트는 next/font/local 대신 app/fonts/pretendard.css 의 unicode-range 동적 서브셋을 쓴다.
// next/font 는 @font-face 를 한 벌만 만들어 unicode-range 분할을 표현할 수 없고, 그래서
// 2,010 KB 짜리 통짜 파일을 통째로 받아야 했다(4G 실측 11.7초). --font-pretendard 변수는
// 그 CSS 의 :root 에서 정의한다. 재생성은 scripts/gen-font-subset.py.

// Google AdSense 사이트 소유 확인용 publisher ID (env 우선, 없으면 하드코딩 폴백)
const ADSENSE_ACCOUNT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-6206539456344377';

const SITE_TITLE = '1000냥 주유소 - 전국 주유소 최저가·기름값, 제일 싼 주유소 찾기';
const SITE_DESCRIPTION =
  '한국석유공사 오피넷(Opinet) 유가 데이터로 전국 주유소 기름값과 최저가를 지도에서 비교하세요. 내 주변·경로 위에서 제일 싼 셀프 주유소(저렴한 주유소)를 찾고, 가격 하락 알림까지. 회원가입만 하면 모두 무료.';

// 검색 키워드. '오피넷'을 넣는 근거: 이 서비스의 유가 원천이 실제로 한국석유공사 오피넷이고
// (OPINET_API_KEY 로 sync-opinet 이 매일 받아온다), 푸터에도 출처를 명시하고 있다.
// 사실 관계 그대로 쓰는 것이지 오피넷을 사칭하거나 제휴를 암시하지 않는다 — 문구도
// '오피넷 데이터 기반'으로만 쓴다.
// 참고: 구글은 meta keywords 를 무시한 지 오래고, 네이버도 가중치가 낮다. 실제 노출은
// 본문·제목·설명에 자연스럽게 들어간 문구가 좌우하므로 description 에도 함께 넣었다.
const SITE_KEYWORDS = [
  '오피넷',
  '오피넷 최저가',
  '오피넷 유가',
  '주유소 최저가',
  '실시간 기름값',
  '내 주변 주유소',
  '셀프 주유소',
  '휘발유 가격',
  '경유 가격',
  '주유소 가격 비교',
];

export const metadata: Metadata = {
  // 상대 경로(opengraph-image 등)를 절대 URL로 변환하는 기준. OG/트위터 이미지가 절대화돼야 SNS가 인식.
  metadataBase: new URL('https://onek1000.kr'),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
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
  // 검색엔진 사이트 소유 확인 meta — 전 페이지 head에 자동 노출.
  //  - 구글 서치콘솔: <meta name="google-site-verification" ...>
  //  - 네이버 서치어드바이저: <meta name="naver-site-verification" ...> (verification.other)
  verification: {
    google: 'lVf5mGCSx2llL2Bndze0gDU7__ez5z_zpYK8RUu_o-M',
    other: {
      'naver-site-verification': '60e71a0297d2959920e93293ef98987535b98b0c',
    },
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
    <html lang="ko">
      <body className="h-full">
        <SessionProvider>
          <SessionGuard />
          <LoginResultTracker />
          <ReferralClaim />
          {children}
          <AdsenseScript />
          <VisitPing />
          <Suspense fallback={null}>
            <FirebaseAnalytics />
          </Suspense>
        </SessionProvider>
      </body>
    </html>
  );
}
