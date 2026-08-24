import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { queryRentalDetail } from '@/lib/db/rental';
import { BackButton } from '@/components/common/BackButton';
import { NaviButton } from '@/components/station/NaviButton';
import { ReviewSection } from '@/components/reviews/ReviewSection';
import { RENTAL_CAR_CLASSES, type RentalDetail } from '@/types/rental';
import { PinIcon, PhoneIcon, ClockIcon, BoltIcon, CarIcon, GlobeIcon } from '@/components/icons';

interface Props { params: { id: string } }

// 렌터카 상세는 우리 DB(rental_cars)만 조회 → 외부 호출 없이 즉시 렌더(정비소 상세와 동형).
// 잘못된 id 진입 시 notFound 를 정확히 내려주기 위해 동적으로 둔다.
export const dynamic = 'force-dynamic';

export default async function RentalDetailPage({ params }: Props) {
  const t = await getTranslations('rental');
  const tCommon = await getTranslations('common');
  const tClass = await getTranslations('map.rentalCarClass');

  const id = (params.id ?? '').trim();
  if (!id || id.length > 200) notFound();

  let detail: RentalDetail | null = null;
  try {
    detail = await queryRentalDetail(id);
  } catch {
    // Supabase 장애/네트워크 오류 → 데이터 없음으로 처리(다른 상세 페이지와 동형).
    detail = null;
  }
  if (!detail) notFound();

  const address = detail.roadAddr ?? detail.jibunAddr ?? null;
  const tel = detail.tel ?? null;
  // 값이 있는 요금만 뽑는다 — 원천 미기재가 흔해 '0원'이나 빈 행을 그리지 않는다.
  const fees = RENTAL_CAR_CLASSES
    .map((c) => ({ carClass: c, price: detail.fees[c] }))
    .filter((f): f is { carClass: typeof f.carClass; price: number } => typeof f.price === 'number');

  // 운영시간 3종(평일/주말/공휴일) 중 시작·종료가 모두 있는 것만 표기한다.
  const hours = [
    { key: 'weekday', open: detail.weekdayOpen, close: detail.weekdayClose },
    { key: 'weekend', open: detail.weekendOpen, close: detail.weekendClose },
    { key: 'holiday', open: detail.holidayOpen, close: detail.holidayClose },
  ].filter((h): h is { key: string; open: string; close: string } => !!h.open && !!h.close);

  // 주유소/EV/세차장/정비소 상세와 동일하게 라이트 전용(OS 다크모드여도 화이트로 통일).
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton ariaLabel={tCommon('backAria')} />
        <h1 className="flex-1 truncate font-bold text-gray-900">{detail.name}</h1>
      </header>

      <section className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {detail.evCars > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">
              <BoltIcon className="h-3.5 w-3.5" />
              {t('evBadge', { count: detail.evCars })}
            </span>
          )}
          {typeof detail.totalCars === 'number' && detail.totalCars > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">
              <CarIcon className="h-3.5 w-3.5" />
              {t('totalCars', { count: detail.totalCars })}
            </span>
          )}
        </div>
        {address && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-gray-600">
            <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span className="min-w-0 break-words">{address}</span>
          </p>
        )}
        {tel ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-600">
            <PhoneIcon className="h-4 w-4 shrink-0 text-gray-400" />
            <a href={`tel:${tel}`} className="text-primary hover:underline">{tel}</a>
          </p>
        ) : (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-400">
            <PhoneIcon className="h-4 w-4 shrink-0" />
            {t('noTel')}
          </p>
        )}
        {detail.homepage && (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm">
            <GlobeIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <a
              href={detail.homepage.startsWith('http') ? detail.homepage : `https://${detail.homepage}`}
              target="_blank"
              rel="noreferrer noopener"
              className="min-w-0 break-all text-primary hover:underline"
            >
              {detail.homepage}
            </a>
          </p>
        )}
      </section>

      {/* 차종별 요금 — 이 앱의 정체성(가격 비교)에 맞춰 가장 위에 둔다.
          ⚠️ 원천이 반기 갱신이라 실제와 다를 수 있다 → 기준일을 반드시 함께 보여준다
          (주유소 상세에서 오피넷 가격에 tradeDate 를 붙이는 것과 같은 규약). */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">{t('feeTitle')}</h2>
        {fees.length > 0 ? (
          <>
            <ul className="divide-y divide-gray-100">
              {fees.map((f) => (
                <li key={f.carClass} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-gray-700">{tClass(f.carClass)}</span>
                  <span className="text-base font-extrabold text-gray-900">
                    ₩{f.price.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
              {detail.dataBaseDate
                ? t('feeDisclaimerWithDate', { date: detail.dataBaseDate })
                : t('feeDisclaimer')}
            </p>
          </>
        ) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-snug text-gray-500">
            {t('noFee')}
          </p>
        )}
      </section>

      {/* 리뷰 — 다른 상세와 동일 위치. 렌터카 좌표를 넘겨 지오펜스(근처에서만 작성) 안내/검증에 쓴다. */}
      <ReviewSection targetType="rental" targetId={id} lat={detail.lat} lng={detail.lng} />

      {/* 운영 정보 — 값이 있는 항목만. 원천 채움률이 낮아 없는 경우가 기본이라고 보고 그린다. */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">{t('operatingInfoTitle')}</h2>
        {hours.length > 0 || detail.holiday ? (
          <div className="space-y-2">
            {hours.map((h) => (
              <InfoRow key={h.key} icon={<ClockIcon className="h-4 w-4" />}>
                {t(`hours.${h.key}` as 'hours.weekday', { open: h.open, close: h.close })}
              </InfoRow>
            ))}
            {detail.holiday && (
              <InfoRow icon={<ClockIcon className="h-4 w-4" />}>
                {t('holiday', { value: detail.holiday })}
              </InfoRow>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-snug text-gray-500">
            {t('noOperatingInfo')}
          </p>
        )}
      </section>

      {/* CTA — 길안내 + (있으면) 전화걸기. */}
      <section className="mt-auto space-y-2 border-t border-gray-100 bg-gray-50 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <NaviButton name={detail.name} lat={detail.lat} lng={detail.lng} />
        {tel && (
          <a
            href={`tel:${tel}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-3.5 text-center font-semibold text-gray-700 hover:bg-gray-50"
          >
            <PhoneIcon className="h-4 w-4" />
            {t('callButton')}
          </a>
        )}
      </section>

      <footer className="border-t border-gray-100 bg-white px-5 py-3 text-center text-[10px] leading-relaxed text-gray-400">
        {t('dataSource')}
        {detail.dataBaseDate ? t('baseDate', { date: detail.dataBaseDate }) : ''}
        <br />
        {t('publicDataDisclaimer')}
      </footer>
    </main>
  );
}

/** 조건부 정보 행 — 값이 있을 때만 렌더(정비소 상세의 InfoRow 와 동형). */
function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-gray-700">
      <span className="mt-0.5 shrink-0 text-gray-400">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
