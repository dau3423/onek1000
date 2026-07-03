// SEO 허브 — "전국 주유소 최저가·기름값 정보" 대표 페이지.
// 지역 없는 일반 검색(전국주유소/싼주유소/저렴한주유소/제일싼주유소/기름값/주유소정보)을
// 잡는 것이 목적이라, 지역 목록 링크 + 키워드가 자연스럽게 담긴 설명·FAQ를 함께 둔다.
import type { Metadata } from 'next';
import Link from 'next/link';
import { REGIONS } from '@/lib/regions';

export const revalidate = 86400; // 하루 1회 갱신이면 충분(목록은 거의 불변)

const SITE = 'https://onek1000.kr';
const title = '전국 주유소 최저가·기름값 정보 | 제일 싼 주유소 찾기 - 1000냥 주유소';
const description =
  '전국 주유소 실시간 기름값과 지역별 최저가를 한눈에. 서울·경기·부산 등 시·도별로 오늘 제일 싼 셀프 주유소(저렴한 주유소) 순위를 매일 업데이트합니다. 한국석유공사 오피넷 기준 주유소 정보.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/regions' },
  openGraph: { title, description, url: '/regions', type: 'website' },
};

// 자주 묻는 질문 — 일반 키워드를 자연스럽게 담고, FAQPage 구조화 데이터로 검색결과 확장 노출을 노린다.
const FAQ: Array<{ q: string; a: string }> = [
  {
    q: '전국에서 제일 싼 주유소는 어떻게 찾나요?',
    a: '지역을 선택하면 한국석유공사 오피넷 실시간 기름값 기준으로 그 지역 최저가 주유소 TOP10을 볼 수 있습니다. 지도에서는 내 위치와 이동 경로 위에서 가장 저렴한 주유소를 자동으로 찾아줍니다.',
  },
  {
    q: '전국 주유소 기름값 정보는 어디서 확인하나요?',
    a: '1000냥 주유소는 전국 주유소의 휘발유·경유 실시간 가격(오피넷 기준)을 지도와 지역별 순위로 제공합니다. 지역별 페이지에서 오늘 가장 싼 주유소 가격을 바로 확인하세요.',
  },
  {
    q: '가장 저렴한 셀프 주유소(거지주유소)는 어떻게 찾나요?',
    a: '지역·시군구별 최저가 순위에서 셀프 여부가 함께 표시됩니다. 흔히 "거지주유소"라 불리는 초저가 셀프 주유소도 지역 페이지나 지도에서 가격순으로 바로 찾을 수 있습니다.',
  },
  {
    q: '1000냥 주유소는 무료인가요?',
    a: '네. 회원가입만 하면 지도·최저가·가격 알림 등 모든 기능을 무료로 사용할 수 있습니다. 결제(₩1,000)는 광고 제거 용도로만 있으며, 선택 사항입니다.',
  },
];

export default function RegionsIndexPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <h1 className="text-2xl font-bold text-gray-900">전국 주유소 최저가·기름값 정보</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        전국 주유소의 실시간 기름값과 지역별 최저가를 한눈에 비교하세요. 시·도, 시·군·구별로 오늘 가장 싼 주유소 TOP10을
        휘발유·경유별로 매일 업데이트합니다. 가격은 한국석유공사 <b>오피넷</b> 기준이며, 내 주변과 이동 경로 위에서
        제일 싼 셀프 주유소는 지도에서 바로 찾을 수 있습니다.
      </p>

      <h2 className="mt-8 text-base font-bold text-gray-900">지역별 최저가 주유소</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {REGIONS.map((r) => (
          <Link
            key={r.slug}
            href={`/regions/${r.slug}`}
            className="rounded-xl border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-800 hover:border-orange-300 hover:bg-orange-50"
          >
            {r.name} 최저가
          </Link>
        ))}
      </div>

      <section className="mt-10 rounded-2xl border border-orange-200 bg-orange-50 p-5">
        <h2 className="text-base font-bold text-orange-900">내 주변·경로 위 최저가는 지도에서</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-orange-800">
          지역 전체가 아니라 내 위치와 이동 경로 위에서 제일 싼 주유소를 자동으로 찾아드립니다.
          회원가입만 하면 모든 기능이 무료입니다.
        </p>
        <Link href="/" className="mt-3 inline-block rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600">
          지도에서 최저가 보기
        </Link>
      </section>

      <section className="mt-10">
        <h2 className="text-base font-bold text-gray-900">자주 묻는 질문</h2>
        <dl className="mt-3 divide-y divide-gray-100">
          {FAQ.map((f) => (
            <div key={f.q} className="py-3">
              <dt className="text-sm font-semibold text-gray-900">{f.q}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-gray-600">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-8 text-[11px] text-gray-400">데이터 제공: 한국석유공사 오피넷 · 가격은 발행 시점 기준이며 실제와 다를 수 있습니다.</p>
    </main>
  );
}
