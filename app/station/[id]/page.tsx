import Link from 'next/link';
import { notFound } from 'next/navigation';
import { queryStationDetailWithPriceFallback } from '@/lib/db/queries';
import { BRAND_LABEL, BRAND_COLOR, PRODUCT_LABEL, type ProductCode, type StationDetail } from '@/types/station';
import { InterstitialAd } from '@/components/ads/InterstitialAd';
import { FavoriteButton } from '@/components/FavoriteButton';
import { PriceHistoryChart } from '@/components/charts/PriceHistoryChart';
import { ReviewSection } from '@/components/reviews/ReviewSection';
import { NaviButton } from '@/components/station/NaviButton';
import { FuelLogButton } from '@/components/station/FuelLogButton';
import { MyFuelLogsSection } from '@/components/station/MyFuelLogsSection';

interface Props { params: { id: string } }

// 가격 없는 주유소는 진입 시 Opinet 실시간 조회 + DB 캐시가 일어나므로 정적 캐싱하지 않는다.
// (가격 있는 주유소는 어차피 Opinet 미호출 — DB 조회만)
export const dynamic = 'force-dynamic';

const PRODUCT_ORDER: ProductCode[] = ['B027', 'B034', 'D047', 'K015', 'C004'];

export default async function StationDetailPage({ params }: Props) {
  // 상세는 우리 DB를 우선 조회한다(Opinet은 1일 1회 sync에서만 호출). 단, 전체 적재로
  // 새로 들어온 "가격이 아직 없는 주유소"는 진입 시 1회만 Opinet detailById로 가격을 받아
  // 표시 + DB 캐시한다(다음 진입부터는 DB만 사용). 가격이 이미 있으면 Opinet 미호출(동작/속도 불변).
  // Opinet 실패/할당량 소진/빈 응답 시엔 DB 스냅샷(가격 미표시)으로 폴백해 페이지가 깨지지 않는다.
  let detail: StationDetail | null = null;
  try {
    detail = await queryStationDetailWithPriceFallback(params.id);
  } catch {
    // Supabase 장애/네트워크 오류 → 데이터 없음으로 처리
    detail = null;
  }

  // DB에 없으면 찾을 수 없음
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
            {BRAND_LABEL[detail.brand]}
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

      {/* 내 주유 기록 — 로그인 사용자의 이 주유소 기록(없으면/비로그인은 자동 숨김) */}
      <MyFuelLogsSection stationId={detail.id} />

      {/* 가격 추이 (휘발유 최근 30일) */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-2 text-sm font-bold text-gray-800">휘발유 30일 추이</h2>
        <PriceHistoryChart stationId={detail.id} product="B027" />
      </section>

      {/* 리뷰 */}
      <ReviewSection stationId={detail.id} />

      {/* 부가서비스 — 우리 DB(stations)만 조회. 값은 일 1회 sync의 회전 보강(detailById)으로 채워진다.
          amenitiesUpdatedAt이 null이면 아직 한 번도 보강되지 않은 주유소이므로
          "없음" 오표시 대신 안내 문구로 대체한다. */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">부가서비스</h2>
        {detail.amenitiesUpdatedAt ? (
          <AmenityList detail={detail} />
        ) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-snug text-gray-500">
            부가서비스 정보가 아직 수집되지 않았습니다.
          </p>
        )}
      </section>

      {/* CTA */}
      <section className="mt-auto space-y-2 border-t border-gray-100 bg-gray-50 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <FuelLogButton stationId={detail.id} unitPrice={detail.prices.B027?.price ?? null} />
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

/** 부가서비스 배지 목록 — 보유 항목만 노출, 하나도 없으면 안내 문구. */
function AmenityList({ detail }: { detail: StationDetail }) {
  const items: Array<{ key: string; label: string; on: boolean }> = [
    { key: 'self', label: '셀프', on: detail.isSelf },
    { key: 'carwash', label: '세차장', on: !!detail.hasCarwash },
    { key: 'cvs', label: '편의점', on: !!detail.hasCvs },
    { key: 'maint', label: '경정비', on: !!detail.hasMaintenance },
    { key: 'lpg', label: 'LPG 충전', on: !!detail.hasLpg },
    { key: 'kpetro', label: '품질인증', on: !!detail.isKpetro },
  ];
  const owned = items.filter((i) => i.on);

  if (owned.length === 0) {
    return (
      <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-snug text-gray-500">
        제공되는 부가서비스가 없습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {owned.map((i) => (
        <li
          key={i.key}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {i.label}
        </li>
      ))}
    </ul>
  );
}
