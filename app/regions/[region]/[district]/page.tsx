// SEO 시군구 랜딩 — "{시도} {시군구} 최저가 주유소 가격 TOP10" (예: 서울 강남구).
// 시도 페이지보다 검색량 큰 세부 키워드("강남 주유소" 등)를 타겟한다.
// URL: /regions/{시도슬러그}/{시군구코드(opinet 4자리)}. ISR로 매시간 가격 갱신.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { regionBySlug, sigunguByCode, sigungusBySido, SIDO_SLUG } from '@/lib/regions';
import { SIGUNGU } from '@/lib/sigungu-data';
import { queryRegionDailyTop10BySigungu, queryNationalAvgPrices } from '@/lib/db/queries';
import { PRODUCT_LABEL, type ProductCode, type DailyTop10Item } from '@/types/station';
import { PriceTable } from '@/components/seo/PriceTable';

export const revalidate = 3600;

const SITE = 'https://onek1000.kr';
const PRODUCTS: ProductCode[] = ['B027', 'D047'];

function kstTodayLabel(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

async function safeTop10(code: string, product: ProductCode): Promise<DailyTop10Item[]> {
  try {
    return await queryRegionDailyTop10BySigungu(code, product);
  } catch {
    return [];
  }
}

export function generateStaticParams() {
  return SIGUNGU.map((s) => ({ region: SIDO_SLUG[s.sido], district: s.code }));
}

export function generateMetadata({ params }: { params: { region: string; district: string } }): Metadata {
  const region = regionBySlug(params.region);
  const sg = sigunguByCode(params.district);
  if (!region || !sg || sg.sido !== region.code) return {};
  const place = `${region.name} ${sg.name}`;
  const title = `${place} 최저가 주유소 가격 TOP10 (오늘 기준) | 1000냥 주유소`;
  const description =
    `${place}에서 가장 싼 주유소 TOP10을 휘발유·경유별로 매일 업데이트합니다. ` +
    `실시간 가격은 한국석유공사 오피넷 기준이며, 내 주변·경로 위 최저가는 1000냥 주유소 지도에서 바로 확인하세요.`;
  const url = `/regions/${region.slug}/${sg.code}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function DistrictPage({ params }: { params: { region: string; district: string } }) {
  const region = regionBySlug(params.region);
  const sg = sigunguByCode(params.district);
  // 시군구가 URL의 시도에 실제로 속할 때만 유효(/regions/busan/0113 같은 불일치 차단).
  if (!region || !sg || sg.sido !== region.code) notFound();

  const place = `${region.name} ${sg.name}`;
  const date = kstTodayLabel();
  const [gasoline, diesel] = await Promise.all(PRODUCTS.map((p) => safeTop10(sg.code, p)));
  const avgs = await queryNationalAvgPrices().catch(() => ({} as Partial<Record<ProductCode, number>>));
  const sections = [
    { product: 'B027' as ProductCode, items: gasoline, avg: avgs['B027'] ?? null },
    { product: 'D047' as ProductCode, items: diesel, avg: avgs['D047'] ?? null },
  ];
  const siblings = sigungusBySido(region.code).filter((d) => d.code !== sg.code);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '지역별 최저가', item: `${SITE}/regions` },
          { '@type': 'ListItem', position: 2, name: region.name, item: `${SITE}/regions/${region.slug}` },
          { '@type': 'ListItem', position: 3, name: sg.name, item: `${SITE}/regions/${region.slug}/${sg.code}` },
        ],
      },
      {
        '@type': 'ItemList',
        name: `${place} 휘발유 최저가 주유소 TOP10`,
        itemListElement: gasoline.map((it) => ({ '@type': 'ListItem', position: it.rank, name: it.name })),
      },
    ],
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-[12px] text-gray-400">
        <Link href="/regions" className="hover:text-gray-600">지역별 최저가</Link>
        <span className="mx-1">›</span>
        <Link href={`/regions/${region.slug}`} className="hover:text-gray-600">{region.name}</Link>
        <span className="mx-1">›</span>
        <span className="text-gray-600">{sg.name}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-bold text-gray-900">{place} 최저가 주유소 가격 TOP10</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        {date} 기준, <b>{place}</b>에서 가장 싸게 주유할 수 있는 주유소를 휘발유·경유별로 정리했습니다.
        가격은 한국석유공사 <b>오피넷</b> 기준이며 실시간으로 변동될 수 있습니다.
      </p>

      {sections.map((s) => (
        <PriceTable key={s.product} label={PRODUCT_LABEL[s.product]} items={s.items} avg={s.avg} />
      ))}

      <section className="mt-10 rounded-2xl border border-orange-200 bg-orange-50 p-5">
        <h2 className="text-base font-bold text-orange-900">{sg.name} 내 최저가는 지도에서 1초 만에</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-orange-800">
          <b>내 위치·이동 경로 위</b>에서 제일 싼 주유소를 자동으로 찾아드립니다.
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

      {siblings.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-bold text-gray-700">{region.name} 다른 지역</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {siblings.map((d) => (
              <Link
                key={d.code}
                href={`/regions/${region.slug}/${d.code}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50"
              >
                {d.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="mt-8 text-[11px] text-gray-400">데이터 제공: 한국석유공사 오피넷 · 가격은 발행 시점 기준이며 실제와 다를 수 있습니다.</p>
    </main>
  );
}
