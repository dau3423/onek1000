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
};

// i18n/request.ts 를 요청 설정으로 등록한다(기본 탐색 경로).
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
