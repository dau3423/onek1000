// SEO 지역 랜딩 — "{지역} 최저가 주유소 가격 TOP10".
// 목적: "서울 최저가 주유소" 같은 검색어로 유입을 받아 지도/가입으로 연결한다.
// - 정적 생성(generateStaticParams) + ISR(revalidate)로 매시간 가격 갱신.
// - 데이터 조회 실패는 빈 표/안내로 graceful 처리(빌드/렌더가 깨지지 않게).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { REGIONS, regionBySlug, sigungusBySido } from '@/lib/regions';
import { queryRegionDailyTop10, queryNationalAvgPrices } from '@/lib/db/queries';
import { PRODUCT_LABEL, type ProductCode, type DailyTop10Item } from '@/types/station';
import { PriceTable } from '@/components/seo/PriceTable';

export const revalidate = 3600; // 1시간마다 가격 갱신(ISR)

const SITE = 'https://onek1000.kr';
const PRODUCTS: ProductCode[] = ['B027', 'D047']; // 휘발유, 경유
function kstTodayLabel(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

// 빌드/렌더가 절대 깨지지 않도록 조회 실패는 빈 결과로 흡수.
async function safeTop10(sido: Parameters<typeof queryRegionDailyTop10>[0], product: ProductCode): Promise<DailyTop10Item[]> {
  try {
    return await queryRegionDailyTop10(sido, product);
  } catch {
    return [];
  }
}

export function generateStaticParams() {
  return REGIONS.map((r) => ({ region: r.slug }));
}

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const region = regionBySlug(params.region);
  if (!region) return {};
  const title = `${region.name} 최저가 주유소 가격 TOP10 (오늘 기준) | 1000냥 주유소`;
  const description =
    `${region.name} 지역에서 가장 싼 주유소 TOP10을 휘발유·경유별로 매일 업데이트합니다. ` +
    `실시간 가격은 한국석유공사 오피넷 기준이며, 내 주변·경로 위 최저가는 1000냥 주유소 지도에서 바로 확인하세요.`;
  const url = `/regions/${region.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function RegionPage({ params }: { params: { region: string } }) {
  const region = regionBySlug(params.region);
  if (!region) notFound();

  const date = kstTodayLabel();
  const [gasoline, diesel] = await Promise.all(PRODUCTS.map((p) => safeTop10(region.code, p)));
  const avgs = await queryNationalAvgPrices().catch(() => ({} as Partial<Record<ProductCode, number>>));
  const sections = [
    { product: 'B027' as ProductCode, items: gasoline, avg: avgs['B027'] ?? null },
    { product: 'D047' as ProductCode, items: diesel, avg: avgs['D047'] ?? null },
  ];
  const districts = sigungusBySido(region.code);

  // JSON-LD: 빵부스러기 + 휘발유 최저가 목록(ItemList). 가격을 구조화 데이터로 노출.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '지역별 최저가', item: `${SITE}/regions` },
          { '@type': 'ListItem', position: 2, name: region.name, item: `${SITE}/regions/${region.slug}` },
        ],
      },
      {
        '@type': 'ItemList',
        name: `${region.name} 휘발유 최저가 주유소 TOP10`,
        itemListElement: gasoline.map((it) => ({
          '@type': 'ListItem',
          position: it.rank,
          name: it.name,
        })),
      },
    ],
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-[12px] text-gray-400">
        <Link href="/regions" className="hover:text-gray-600">지역별 최저가</Link>
        <span className="mx-1">›</span>
        <span className="text-gray-600">{region.name}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-bold text-gray-900">{region.name} 최저가 주유소 가격 TOP10</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        {date} 기준, <b>{region.name}</b> 지역에서 가장 싸게 주유할 수 있는 주유소를 휘발유·경유별로 정리했습니다.
        가격은 한국석유공사 <b>오피넷</b> 기준이며 실시간으로 변동될 수 있습니다.
      </p>

      {sections.map((s) => (
        <PriceTable key={s.product} label={PRODUCT_LABEL[s.product]} items={s.items} avg={s.avg} />
      ))}

      {/* 시군구별 세부 페이지 링크(내부 링크 + "강남구 주유소" 류 세부 검색어 타겟) */}
      {districts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-base font-bold text-gray-900">{region.name} 시·군·구별 최저가</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {districts.map((d) => (
              <Link
                key={d.code}
                href={`/regions/${region.slug}/${d.code}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700 hover:border-orange-300 hover:bg-orange-50"
              >
                {d.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 전환 CTA — 검색으로 들어온 사람을 지도/가입으로 보낸다. */}
      <section className="mt-10 rounded-2xl border border-orange-200 bg-orange-50 p-5">
        <h2 className="text-base font-bold text-orange-900">내 주변 최저가는 지도에서 1초 만에</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-orange-800">
          {region.name} 전체가 아니라 <b>내 위치·이동 경로 위</b>에서 제일 싼 주유소를 자동으로 찾아드립니다.
          지도를 줌하면 그 영역 최저가가 자동 정렬되고, 가격이 떨어지면 알림도 받을 수 있어요.
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/" className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600">
            지도에서 최저가 보기
          </Link>
          <Link href="/auth/sign-in" className="rounded-xl border border-orange-300 bg-white px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100">
            무료로 시작하기
          </Link>
        </div>
      </section>

      {/* 지역 간 내부 링크(크롤 가능 클러스터) */}
      <section className="mt-10">
        <h2 className="text-sm font-bold text-gray-700">다른 지역 최저가</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {REGIONS.filter((r) => r.slug !== region.slug).map((r) => (
            <Link
              key={r.slug}
              href={`/regions/${r.slug}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50"
            >
              {r.name}
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-8 text-[11px] text-gray-400">데이터 제공: 한국석유공사 오피넷 · 가격은 발행 시점 기준이며 실제와 다를 수 있습니다.</p>
    </main>
  );
}
