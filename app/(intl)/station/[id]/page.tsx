import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { queryStationDetailWithPriceFallback } from '@/lib/db/queries';
import { BackButton } from '@/components/common/BackButton';
import { BRAND_COLOR, type ProductCode, type StationDetail } from '@/types/station';
import { InterstitialAd } from '@/components/ads/InterstitialAd';
import { FavoriteButton } from '@/components/FavoriteButton';
import { ReviewSection } from '@/components/reviews/ReviewSection';
import { NaviButton } from '@/components/station/NaviButton';
import { FuelSelectionProvider } from '@/components/station/FuelSelectionProvider';
import { PriceTrendSection } from '@/components/station/PriceTrendSection';
import { FuelLogSelectedButton } from '@/components/station/FuelLogSelectedButton';
import { MyFuelLogsSection } from '@/components/station/MyFuelLogsSection';
import { StationViewTracker } from '@/components/station/StationViewTracker';
import { PinIcon, PhoneIcon } from '@/components/icons';

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

  const t = await getTranslations('station');
  const tLabels = await getTranslations('labels');
  const tCommon = await getTranslations('common');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      {/* 상세 열람 계측(렌더 결과 없음) — 열릴 때마다 station_detail_view 1건 */}
      <StationViewTracker stationId={detail.id} />
      <InterstitialAd />
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton ariaLabel={tCommon('backAria')} />
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
            {tLabels(`brand.${detail.brand}`)}
          </span>
          {detail.isHighway && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
              {t('page.highway')}
              {detail.routeName ? ` · ${detail.routeName}` : ''}
              {detail.direction ? `(${detail.direction})` : ''}
            </span>
          )}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
          <PinIcon className="h-4 w-4 shrink-0 text-gray-400" />
          {detail.address}
        </p>
        {detail.tel && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
            <PhoneIcon className="h-4 w-4 shrink-0 text-gray-400" />
            {detail.tel}
          </p>
        )}
      </section>

      {/* 유종별 가격 */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">{t('page.productPrices')}</h2>
        <ul className="divide-y divide-gray-100">
          {PRODUCT_ORDER.map((p) => {
            const v = detail.prices[p];
            return (
              <li key={p} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-700">{tLabels(`product.${p}`)}</span>
                {v ? (
                  <span className="text-base font-extrabold text-gray-900">
                    ₩{v.price.toLocaleString()}
                    <span className="ml-1 text-[10px] font-normal text-gray-400">
                      {v.tradeDate}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">{t('page.noPriceInfo')}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 내 주유 기록 — 로그인 사용자의 이 주유소 기록(없으면/비로그인은 자동 숨김) */}
      <MyFuelLogsSection stationId={detail.id} />

      {/*
        유종 선택 공유 스코프 — 가격 추이 탭과 CTA 주유기록 버튼이 같은 선택 유종을 쓴다.
        FuelSelectionProvider(Context.Provider)는 DOM 노드를 만들지 않으므로 아래 서버 섹션들을
        children으로 감싸도 추이 → 리뷰 → 부가서비스 → CTA의 시각/DOM 순서는 그대로 보존된다.
      */}
      <FuelSelectionProvider prices={detail.prices}>
        {/* 가격 추이 (선택 유종 최근 30일) — non-null 유종 탭, 홈 유종을 기본 선택 */}
        <PriceTrendSection stationId={detail.id} />

        {/* 리뷰 — 주유소 좌표를 넘겨 작성 전 지오펜스(근처에서만 작성) 안내/검증 */}
        <ReviewSection stationId={detail.id} stationLat={detail.lat} stationLng={detail.lng} />

        {/* 부가서비스 — 우리 DB(stations)만 조회. 값은 일 1회 sync의 회전 보강(detailById)으로 채워진다.
            amenitiesUpdatedAt이 null이면 아직 한 번도 보강되지 않은 주유소이므로
            "없음" 오표시 대신 안내 문구로 대체한다. */}
        <section className="border-t border-gray-100 px-5 py-4">
          <h2 className="mb-3 text-sm font-bold text-gray-800">{t('page.amenities')}</h2>
          {detail.amenitiesUpdatedAt ? (
            <AmenityList detail={detail} t={t} />
          ) : (
            <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-snug text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {t('page.amenitiesPending')}
            </p>
          )}
        </section>

        {/* CTA */}
        <section className="mt-auto space-y-2 border-t border-gray-100 bg-gray-50 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <FuelLogSelectedButton stationId={detail.id} prices={detail.prices} />
          <NaviButton name={detail.name} lat={detail.lat} lng={detail.lng} stationId={detail.id} />
          {detail.tel && (
            <a
              href={`tel:${detail.tel}`}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-3.5 text-center font-semibold text-gray-700 hover:bg-gray-50"
            >
              <PhoneIcon className="h-4 w-4" />
              {t('page.call')}
            </a>
          )}
        </section>
      </FuelSelectionProvider>

      <footer className="border-t border-gray-100 bg-white px-5 py-3 text-center text-[10px] text-gray-400">
        {t('page.dataSource')}
      </footer>
    </main>
  );
}

/** 부가서비스 배지 목록 — 보유 항목만 노출, 하나도 없으면 안내 문구. */
function AmenityList({
  detail,
  t,
}: {
  detail: StationDetail;
  t: Awaited<ReturnType<typeof getTranslations<'station'>>>;
}) {
  const items: Array<{ key: string; label: string; on: boolean }> = [
    { key: 'self', label: t('self'), on: detail.isSelf },
    { key: 'carwash', label: t('page.amenity.carwash'), on: !!detail.hasCarwash },
    { key: 'cvs', label: t('page.amenity.cvs'), on: !!detail.hasCvs },
    { key: 'maint', label: t('page.amenity.maint'), on: !!detail.hasMaintenance },
    { key: 'lpg', label: t('page.amenity.lpg'), on: !!detail.hasLpg },
    { key: 'kpetro', label: t('page.amenity.kpetro'), on: !!detail.isKpetro },
  ];
  const owned = items.filter((i) => i.on);

  if (owned.length === 0) {
    return (
      <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-snug text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        {t('page.noAmenities')}
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
