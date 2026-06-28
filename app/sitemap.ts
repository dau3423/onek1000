// 사이트맵 — 구글/네이버가 공개 페이지(특히 지역 랜딩)를 발견·크롤하도록 노출.
// 동적 라우트(/regions/[region])는 lib/regions의 전 지역을 자동 포함한다.
import type { MetadataRoute } from 'next';
import { REGIONS, SIDO_SLUG } from '@/lib/regions';
import { SIGUNGU } from '@/lib/sigungu-data';

const SITE = 'https://onek1000.kr';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/regions`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/pricing`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE}/legal/terms`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE}/legal/privacy`, changeFrequency: 'yearly', priority: 0.1 },
  ];

  const regionPages: MetadataRoute.Sitemap = REGIONS.map((r) => ({
    url: `${SITE}/regions/${r.slug}`,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // 시군구 세부 페이지(예: /regions/seoul/0113 = 강남구)
  const districtPages: MetadataRoute.Sitemap = SIGUNGU.map((s) => ({
    url: `${SITE}/regions/${SIDO_SLUG[s.sido]}/${s.code}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...staticPages, ...regionPages, ...districtPages];
}
