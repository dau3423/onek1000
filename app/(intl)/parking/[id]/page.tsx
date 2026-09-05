import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { queryParkingDetail } from '@/lib/db/parking';
import { BackButton } from '@/components/common/BackButton';
import { NaviButton } from '@/components/station/NaviButton';
import { toFeeKindCode, toLotKindCode, toLotTypeCode, realFee, hasRealAmount } from '@/lib/parking/labels';
import type { ParkingMarker } from '@/types/parking';
import { PinIcon, PhoneIcon, ClockIcon, CoinIcon, BuildingIcon } from '@/components/icons';

interface Props { params: { id: string } }

// 주차장 상세는 우리 DB(parking_lots)만 조회 → 외부 호출 없이 즉시 렌더(렌터카·정비소 상세와 동형).
// 잘못된 id 진입 시 notFound 를 정확히 내려주기 위해 동적으로 둔다.
export const dynamic = 'force-dynamic';

export default async function ParkingDetailPage({ params }: Props) {
  const t = await getTranslations('parking');
  const tMap = await getTranslations('map');
  const tCommon = await getTranslations('common');

  const id = (params.id ?? '').trim();
  if (!id || id.length > 200) notFound();

  let detail: ParkingMarker | null = null;
  try {
    detail = await queryParkingDetail(id);
  } catch {
    // Supabase 장애/네트워크 오류 → 데이터 없음으로 처리(다른 상세 페이지와 동형).
    detail = null;
  }
  if (!detail) notFound();

  const address = detail.roadAddr ?? detail.jibunAddr ?? null;
  const feeCode = toFeeKindCode(detail.feeKind);
  const lotKindCode = toLotKindCode(detail.lotKind);
  const lotTypeCode = toLotTypeCode(detail.lotType);
  // 매핑에 없는 원천 값은 원문 그대로 노출한다 — 사라지는 것보다 낫다(lib/parking/labels.ts).
  const kindText = lotKindCode ? tMap(`parking.lotKind.${lotKindCode}`) : detail.lotKind;
  const typeText = lotTypeCode ? tMap(`parking.lotType.${lotTypeCode}`) : detail.lotType;

  // 운영시간 3종 중 시작·종료가 모두 있는 것만 표기한다(원천 미기재가 흔하다).
  const hours = [
    { key: 'weekday' as const, open: detail.wdOpen, close: detail.wdClose },
    { key: 'saturday' as const, open: detail.satOpen, close: detail.satClose },
    { key: 'holiday' as const, open: detail.hdOpen, close: detail.hdClose },
  ].filter((h): h is { key: 'weekday' | 'saturday' | 'holiday'; open: string; close: string } => !!h.open && !!h.close);

  // 값이 있는 요금만 뽑는다 — '0원'이나 빈 행을 그리지 않는다.
  // 원천이 무료 주차장에 0 을 넣으므로 **양수일 때만** 요금으로 본다(labels.ts hasRealFee 주석).
  const basicFee = realFee(detail.basicCharge, detail.basicTime);
  const addFee = realFee(detail.addUnitCharge, detail.addUnitTime);
  const hasBasic = basicFee !== null;
  const hasAdd = addFee !== null;
  const anyFee = hasBasic || hasAdd || hasRealAmount(detail.dayTicket) || hasRealAmount(detail.monthTicket);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl bg-white pb-24">
      <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <BackButton />
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-gray-900">{detail.name}</h1>
      </header>

      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {kindText && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-bold text-gray-600">
              {kindText}
            </span>
          )}
          {typeText && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-bold text-gray-600">
              {typeText}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            feeCode === 'free' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
          }`}>
            {feeCode === 'free' ? tMap('parking.feeFree')
              : feeCode === 'paid' ? tMap('parking.feePaid')
              : feeCode === 'mixed' ? tMap('parking.feeMixed')
              : tMap('parking.feeUnknown')}
          </span>
        </div>

        {address && (
          <p className="mt-3 flex items-start gap-2 text-sm text-gray-700">
            <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span>{address}</span>
          </p>
        )}

        <div className="mt-4">
          <NaviButton name={detail.name} lat={detail.lat} lng={detail.lng} />
        </div>

        {/* ── 규모 ── 이 기획의 태도가 드러나는 자리다. 숫자만 두면 '빈자리'로 읽히므로
            '총 N면'으로 쓰고, 실시간 빈자리를 제공하지 않는다는 사실을 바로 아래 문장으로 붙인다. */}
        <section className="mt-6">
          <h2 className="text-sm font-bold text-gray-800">{t('capacityTitle')}</h2>
          <p className="mt-1 text-lg font-extrabold text-gray-900">
            {detail.capacity != null ? t('capacityValue', { count: detail.capacity }) : t('capacityUnknown')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {detail.capacity != null
              ? t('noVacancyNotice', { count: detail.capacity })
              : t('noVacancyNoticeNoCapacity')}
          </p>
          {detail.disabledZone === true && (
            <p className="mt-2 text-xs font-semibold text-gray-700">{t('disabledZone')}</p>
          )}
        </section>

        {/* ── 요금 ── */}
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
            <CoinIcon className="h-4 w-4 text-gray-400" />
            {t('feeTitle')}
          </h2>
          {anyFee ? (
            <dl className="mt-2 space-y-1 text-sm">
              {hasBasic && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('fee.basic')}</dt>
                  <dd className="font-semibold text-gray-900">
                    {t('fee.minutesWon', { time: basicFee!.time, charge: basicFee!.charge.toLocaleString() })}
                  </dd>
                </div>
              )}
              {hasAdd && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('fee.add')}</dt>
                  <dd className="font-semibold text-gray-900">
                    {t('fee.minutesWon', { time: addFee!.time, charge: addFee!.charge.toLocaleString() })}
                  </dd>
                </div>
              )}
              {hasRealAmount(detail.dayTicket) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('fee.dayTicket')}</dt>
                  <dd className="font-semibold text-gray-900">₩{detail.dayTicket.toLocaleString()}</dd>
                </div>
              )}
              {hasRealAmount(detail.monthTicket) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('fee.monthTicket')}</dt>
                  <dd className="font-semibold text-gray-900">₩{detail.monthTicket.toLocaleString()}</dd>
                </div>
              )}
              {detail.payMethods && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('fee.payMethods')}</dt>
                  <dd className="text-right font-semibold text-gray-900">{detail.payMethods}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-1 text-sm text-gray-500">{t('noFee')}</p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            {detail.dataBaseDate
              ? t('feeDisclaimerWithDate', { date: detail.dataBaseDate })
              : t('feeDisclaimer')}
          </p>
        </section>

        {/* ── 운영시간 ── */}
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
            <ClockIcon className="h-4 w-4 text-gray-400" />
            {t('operatingInfoTitle')}
          </h2>
          {hours.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
              {hours.map((h) => (
                <li key={h.key}>{t(`hours.${h.key}`, { open: h.open, close: h.close })}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-gray-500">{t('noOperatingInfo')}</p>
          )}
        </section>

        {/* ── 연락처 / 관리기관 ── */}
        <section className="mt-6">
          {detail.tel ? (
            <a
              href={`tel:${detail.tel}`}
              className="flex h-11 items-center gap-2 text-sm font-semibold text-primary"
            >
              <PhoneIcon className="h-4 w-4" />
              {detail.tel}
              <span className="text-gray-400">· {t('callButton')}</span>
            </a>
          ) : (
            <p className="text-sm text-gray-500">{t('noTel')}</p>
          )}
          {detail.instName && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
              <BuildingIcon className="h-3.5 w-3.5 text-gray-400" />
              {t('instName', { name: detail.instName })}
            </p>
          )}
        </section>

        {detail.note && (
          <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
            {detail.note}
          </p>
        )}

        <p className="mt-6 text-[11px] text-gray-400">
          {t('dataSource')}
          {detail.dataBaseDate ? t('baseDate', { date: detail.dataBaseDate }) : ''}
          <br />
          {t('publicDataDisclaimer')}
        </p>
        <span className="sr-only">{tCommon('navigate')}</span>
      </div>
    </main>
  );
}
