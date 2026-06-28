// robots.txt — 공개 페이지는 크롤 허용, 운영/개인/API 경로는 차단. 사이트맵 위치 명시.
import type { MetadataRoute } from 'next';

const SITE = 'https://onek1000.kr';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/my', '/auth/'],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
