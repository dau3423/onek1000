import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchStationDetail } from '@/lib/opinet/client';
import { BRAND_LABEL, BRAND_COLOR, PRODUCT_LABEL, type ProductCode } from '@/types/station';
import { InterstitialAd } from '@/components/ads/InterstitialAd';
import { FavoriteButton } from '@/components/FavoriteButton';
import { PriceHistoryChart } from '@/components/charts/PriceHistoryChart';
import { ReviewSection } from '@/components/reviews/ReviewSection';
import { NaviButton } from '@/components/station/NaviButton';

interface Props { params: { id: string } }

const PRODUCT_ORDER: ProductCode[] = ['B027', 'B034', 'D047', 'K015', 'C004'];

export default async function StationDetailPage({ params }: Props) {
  const detail = await fetchStationDetail(params.id);
  if (!detail) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <InterstitialAd />
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="flex-1 truncate font-bold text-gray-900">{detail.name}</h1>
        <FavoriteButton stationId={detail.id} />
      </header>

      {/* 브랜드 + 주소 카드 */}
      <section className="px-5 py-4">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: BRAND_COLOR[detail.brand] }}
          />
          <span className="text-sm font-semibold text-gray-700">
            {BRAND_LABEL[detail.brand]}{detail.isSelf ? ' · 셀프' : ''}
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-600">📍 {detail.address}</p>
        {detail.tel && <p className="mt-1 text-sm text-gray-600">📞 {detail.tel}</p>}
      </section>

      {/* 유종별 가격 */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">유종별 가격</h2>
        <ul className="divide-y divide-gray-100">
          {PRODUCT_ORDER.map((p) => {
            const v = detail.prices[p];
            return (
              <li key={p} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-700">{PRODUCT_LABEL[p]}</span>
                {v ? (
                  <span className="text-base font-extrabold text-gray-900">
                    ₩{v.price.toLocaleString()}
                    <span className="ml-1 text-[10px] font-normal text-gray-400">
                      {v.tradeDate}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">정보 없음</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 가격 추이 (휘발유 최근 30일) */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-2 text-sm font-bold text-gray-800">휘발유 30일 추이</h2>
        <PriceHistoryChart stationId={detail.id} product="B027" />
      </section>

      {/* 리뷰 */}
      <ReviewSection stationId={detail.id} />

      {/* 부가서비스 */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">부가서비스</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge on={detail.isSelf}>셀프</Badge>
          <Badge on={detail.hasCarwash}>세차장</Badge>
          <Badge on={detail.hasCvs}>편의점</Badge>
          <Badge on={detail.hasMaintenance}>정비소</Badge>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-auto space-y-2 border-t border-gray-100 bg-gray-50 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <NaviButton name={detail.name} lat={detail.lat} lng={detail.lng} />
        {detail.tel && (
          <a
            href={`tel:${detail.tel}`}
            className="block w-full rounded-xl border border-gray-200 bg-white py-3.5 text-center font-semibold text-gray-700 hover:bg-gray-50"
          >
            ☎ 전화걸기
          </a>
        )}
      </section>

      <footer className="border-t border-gray-100 bg-white px-5 py-3 text-center text-[10px] text-gray-400">
        데이터 제공: 한국석유공사 오피넷
      </footer>
    </main>
  );
}

function Badge({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        on
          ? 'rounded-full bg-cheap/10 px-3 py-1 font-semibold text-cheap'
          : 'rounded-full bg-gray-100 px-3 py-1 text-gray-400 line-through'
      }
    >
      {on ? '✅ ' : '❌ '}{children}
    </span>
  );
}
