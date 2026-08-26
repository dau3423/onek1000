import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 't1.daumcdn.net' },
    ],
  },
  async headers() {
    return [
      {
        // 폰트 청크는 내용이 고정이고 경로에 버전(v1.3.9)이 박혀 있다 — 폰트를 갱신하면
        // 경로가 바뀌어 캐시가 스스로 무효화되므로 immutable 로 둘 수 있다.
        // (next/font 를 쓰던 때는 Next 가 /_next/static/media 에 넣어 자동으로 이 캐시를
        //  붙여 줬다. public/ 은 기본이 max-age=0 이라 직접 붙이지 않으면 매번 재검증한다.)
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

// i18n/request.ts 를 요청 설정으로 등록한다(기본 탐색 경로).
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
