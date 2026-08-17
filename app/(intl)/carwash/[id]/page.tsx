import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { queryCarwashDetail } from '@/lib/db/carwash';
import { BackButton } from '@/components/common/BackButton';
import { NaviButton } from '@/components/station/NaviButton';
import { CarwashTypeBadge } from '@/components/carwash/CarwashTypeBadge';
import type { CarwashDetail } from '@/types/carwash';
import { PinIcon, PhoneIcon, ClockIcon, CoinIcon } from '@/components/icons';

interface Props { params: { id: string } }

// 세차장 상세는 우리 DB(carwash_places)만 조회 → 외부 호출 없이 즉시 렌더(빠른 진입).
// 정적정보라 자주 바뀌지 않지만, 잘못된 id 진입 시 notFound를 정확히 내려주기 위해 동적으로 둔다.
export const dynamic = 'force-dynamic';

export default async function CarwashDetailPage({ params }: Props) {
  const t = await getTranslations('carwash');
  // id = carwash_places PK(mgmt_no). Next가 이미 디코딩해 넘겨준다. 안전 검증 후 조회.
  const id = (params.id ?? '').trim();
  // 빈 값/과도한 길이는 조회 없이 즉시 없음 처리(원천 mgmt_no는 수십자 이내).
  if (!id || id.length > 200) notFound();

  let detail: CarwashDetail | null = null;
  try {
    detail = await queryCarwashDetail(id);
  } catch {
    // Supabase 장애/네트워크 오류 → 데이터 없음으로 처리(주유소 상세와 동형).
    detail = null;
  }
  // DB에 없으면 찾을 수 없음(주유소 상세의 notFound 빈 상태와 동형).
  if (!detail) notFound();

  const address = detail.roadAddr ?? detail.jibunAddr ?? null;
  const tel = detail.tel ?? null;
  const weekdayHours = detail.weekdayOpen
    ? detail.weekdayClose
      ? t('weekdayHoursRange', { open: detail.weekdayOpen, close: detail.weekdayClose })
      : t('weekdayHoursOpenOnly', { open: detail.weekdayOpen })
    : null;
  const holidayHours = detail.holidayOpen
    ? detail.holidayClose
      ? t('holidayHoursRange', { open: detail.holidayOpen, close: detail.holidayClose })
      : t('holidayHoursOpenOnly', { open: detail.holidayOpen })
    : null;
  const fee = detail.feeInfo ?? null;
  const closedDay = detail.closedDay ?? null;

  // 주유소/EV 상세와 동일하게 라이트 전용(OS 다크모드여도 화이트로 통일).
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton />
        <h1 className="flex-1 truncate font-bold text-gray-900">{detail.name}</h1>
      </header>

      {/* 유형 뱃지 + 주소/전화 */}
      <section className="px-5 py-4">
        {/* 상세는 라이트 전용(bg-white) → forceLight로 다크 pill이 뜨지 않게 라이트 팔레트만 렌더. */}
        <CarwashTypeBadge type={detail.washType} size="md" forceLight />
        {address && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-gray-600">
            <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span className="min-w-0 break-words">{address}</span>
          </p>
        )}
        {tel && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-600">
            <PhoneIcon className="h-4 w-4 shrink-0 text-gray-400" />
            <a href={`tel:${tel}`} className="text-primary hover:underline">{tel}</a>
          </p>
        )}
      </section>

      {/* 운영 정보 — 값이 있는 항목만 노출(채움률 낮음, undefined/빈값 노출 금지). 하나도 없으면 안내. */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">{t('operatingInfoTitle')}</h2>
        {weekdayHours || holidayHours || fee || closedDay ? (
          <div className="space-y-2">
            {weekdayHours && (
              <InfoRow icon={<ClockIcon className="h-4 w-4" />}>{weekdayHours}</InfoRow>
            )}
            {holidayHours && (
              <InfoRow icon={<ClockIcon className="h-4 w-4" />}>{holidayHours}</InfoRow>
            )}
            {closedDay && (
              <InfoRow icon={<ClockIcon className="h-4 w-4" />}>{t('closedDay', { day: closedDay })}</InfoRow>
            )}
            {fee && (
              <InfoRow icon={<CoinIcon className="h-4 w-4" />}>{fee}</InfoRow>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-snug text-gray-500">
            {t('noOperatingInfo')}
          </p>
        )}
      </section>

      {/* CTA — 길안내(3앱 선택) + (있으면) 전화걸기. 세차장은 가격/브랜드 개념이 없어 관련 표기 없음. */}
      <section className="mt-auto space-y-2 border-t border-gray-100 bg-gray-50 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        {/* NaviButton은 name/좌표만 사용(가격·브랜드 미참조). 세차장 이름·좌표로 길안내. */}
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

      {/* 데이터 출처 + 노후 가능 고지 */}
      <footer className="border-t border-gray-100 bg-white px-5 py-3 text-center text-[10px] leading-relaxed text-gray-400">
        {t('dataSource')}
        {detail.dataBaseDate ? t('baseDate', { date: detail.dataBaseDate }) : ''}
        <br />
        {t('publicDataDisclaimer')}
      </footer>
    </main>
  );
}

/** 조건부 정보 행 — 값이 있을 때만 라벨째 렌더(CarwashPopup의 InfoRow와 동형). */
function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-gray-700">
      <span className="mt-0.5 shrink-0 text-gray-400">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
