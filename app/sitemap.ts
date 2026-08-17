// 사이트맵 — 구글/네이버가 공개 페이지(특히 지역 랜딩)를 발견·크롤하도록 노출.
// 동적 라우트(/regions/[region])는 lib/regions의 전 지역을 자동 포함한다.
//
// lastModified: 구글이 크롤 스케줄링에 실제로 쓰는 거의 유일한 사이트맵 신호다(priority·changeFrequency는
//   구글이 무시한다 — 다만 네이버/Bing이 참고할 수 있어 그대로 둔다).
//   지역 페이지는 ISR(revalidate 3600)로 가격이 매일 바뀌므로 KST 오늘 날짜가 **사실에 맞는** 값이다.
//   반면 약관·가격정책은 실제 수정일을 런타임에 알 수 없어, 거짓 날짜를 심는 대신 lastModified 를 생략한다
//   (사이트맵에서 선택 항목이다). 매일 "방금 수정됨"으로 거짓 신고하면 구글이 이 신호를 신뢰하지 않게 된다.
import type { MetadataRoute } from 'next';
import { REGIONS, SIDO_SLUG } from '@/lib/regions';
import { SIGUNGU } from '@/lib/sigungu-data';

const SITE = 'https://onek1000.kr';

/** KST 기준 오늘 00:00 — 가격이 매일 갱신되는 페이지의 lastModified. */
function kstToday(): Date {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const priceUpdatedAt = kstToday();

  // 가격이 매일 바뀌는 페이지 — lastModified 를 붙인다.
  const dailyPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: priceUpdatedAt, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/regions`, lastModified: priceUpdatedAt, changeFrequency: 'daily', priority: 0.9 },
  ];

  // 수정일을 런타임에 알 수 없는 정적 문서 — lastModified 생략(거짓 날짜 금지).
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/pricing`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE}/legal/terms`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE}/legal/privacy`, changeFrequency: 'yearly', priority: 0.1 },
  ];

  const regionPages: MetadataRoute.Sitemap = REGIONS.map((r) => ({
    url: `${SITE}/regions/${r.slug}`,
    lastModified: priceUpdatedAt,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // 시군구 세부 페이지(예: /regions/seoul/0113 = 강남구)
  const districtPages: MetadataRoute.Sitemap = SIGUNGU.map((s) => ({
    url: `${SITE}/regions/${SIDO_SLUG[s.sido]}/${s.code}`,
    lastModified: priceUpdatedAt,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...dailyPages, ...staticPages, ...regionPages, ...districtPages];
}
