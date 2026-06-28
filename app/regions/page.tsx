// SEO 허브 — 지역별 최저가 주유소 페이지로 가는 인덱스(전 지역 내부 링크).
// 구글이 여기서 17개 지역 페이지를 모두 발견·크롤할 수 있게 한다.
import type { Metadata } from 'next';
import Link from 'next/link';
import { REGIONS } from '@/lib/regions';

export const revalidate = 86400; // 하루 1회 갱신이면 충분(목록은 거의 불변)

const title = '지역별 최저가 주유소 가격 TOP10 | 1000냥 주유소';
const description =
  '전국 시·도별 최저가 주유소 TOP10을 휘발유·경유별로 매일 업데이트합니다. 서울·경기·부산 등 지역을 선택해 오늘 가장 싼 주유소 가격을 확인하세요. (한국석유공사 오피넷 기준)';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/regions' },
  openGraph: { title, description, url: '/regions', type: 'website' },
};

export default function RegionsIndexPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold text-gray-900">지역별 최저가 주유소</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        전국 시·도별로 오늘 가장 싼 주유소 TOP10을 휘발유·경유별로 정리했습니다.
        지역을 선택하면 실시간(오피넷 기준) 최저가 순위를 볼 수 있어요.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
        </p>
        <Link href="/" className="mt-3 inline-block rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600">
          지도에서 최저가 보기
        </Link>
      </section>
    </main>
  );
}
