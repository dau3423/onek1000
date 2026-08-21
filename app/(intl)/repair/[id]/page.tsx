import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { queryRepairDetail } from '@/lib/db/repair';
import { BackButton } from '@/components/common/BackButton';
import { NaviButton } from '@/components/station/NaviButton';
import { RepairTypeBadge } from '@/components/repair/RepairTypeBadge';
import type { RepairDetail } from '@/types/repair';
import { PinIcon, PhoneIcon, ClockIcon, BuildingIcon } from '@/components/icons';

interface Props { params: { id: string } }

// 정비소 상세는 우리 DB(repair_shops)만 조회 → 외부 호출 없이 즉시 렌더(세차장 상세와 동형).
// 잘못된 id 진입 시 notFound를 정확히 내려주기 위해 동적으로 둔다.
export const dynamic = 'force-dynamic';

export default async function RepairDetailPage({ params }: Props) {
  const t = await getTranslations('repair');
  const tCommon = await getTranslations('common');
  // id = repair_shops PK(shop_key, 32자 hex 합성키). Next가 이미 디코딩해 넘겨준다.
  const id = (params.id ?? '').trim();
  if (!id || id.length > 200) notFound();

  let detail: RepairDetail | null = null;
  try {
    detail = await queryRepairDetail(id);
  } catch {
    // Supabase 장애/네트워크 오류 → 데이터 없음으로 처리(세차장 상세와 동형).
    detail = null;
  }
  if (!detail) notFound();

  const address = detail.roadAddr ?? detail.jibunAddr ?? null;
  const tel = detail.tel ?? null;
  // 원천 채움률이 낮다(전화 51%, 영업시간 38%) — 없는 경우가 기본이라고 보고 그린다.
  const hours = detail.openTime
    ? detail.closeTime
      ? t('hoursRange', { open: detail.openTime, close: detail.closeTime })
      : t('hoursOpenOnly', { open: detail.openTime })
    : null;

  // 주유소/EV/세차장 상세와 동일하게 라이트 전용(OS 다크모드여도 화이트로 통일).
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton ariaLabel={tCommon('backAria')} />
        <h1 className="flex-1 truncate font-bold text-gray-900">{detail.name}</h1>
      </header>

      <section className="px-5 py-4">
        <RepairTypeBadge type={detail.shopType} size="md" forceLight />
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
      </section>

      {/* 운영 정보 — 값이 있는 항목만 노출. 하나도 없으면 안내(원천 채움률이 낮아 흔한 경우다). */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">{t('operatingInfoTitle')}</h2>
        {hours || detail.institution ? (
          <div className="space-y-2">
            {hours && <InfoRow icon={<ClockIcon className="h-4 w-4" />}>{hours}</InfoRow>}
            {detail.institution && (
              <InfoRow icon={<BuildingIcon className="h-4 w-4" />}>
                {t('institution', { name: detail.institution })}
              </InfoRow>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-snug text-gray-500">
            {t('noOperatingInfo')}
          </p>
        )}
      </section>

      {/* CTA — 길안내 + (있으면) 전화걸기. 정비소는 가격/브랜드 개념이 없어 관련 표기 없음. */}
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

/** 조건부 정보 행 — 값이 있을 때만 렌더(세차장 상세의 InfoRow와 동형). */
function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-gray-700">
      <span className="mt-0.5 shrink-0 text-gray-400">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
