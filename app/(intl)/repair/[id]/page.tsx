import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { queryRepairDetail } from '@/lib/db/repair';
import { BackButton } from '@/components/common/BackButton';
import { NaviButton } from '@/components/station/NaviButton';
import { RepairTypeBadge } from '@/components/repair/RepairTypeBadge';
import { RepairBrandBadge } from '@/components/repair/RepairBrandBadge';
import { ReviewSection } from '@/components/reviews/ReviewSection';
import type { RepairDetail } from '@/types/repair';
import { CorrectionButton } from '@/components/corrections/CorrectionButton';
import { PinIcon, PhoneIcon, ClockIcon, BuildingIcon, CheckCircleIcon, ChevronRightIcon } from '@/components/icons';

interface Props { params: { id: string } }

// 정비소 상세는 우리 DB(repair_shops)만 조회 → 외부 호출 없이 즉시 렌더(세차장 상세와 동형).
// 잘못된 id 진입 시 notFound를 정확히 내려주기 위해 동적으로 둔다.
export const dynamic = 'force-dynamic';

export default async function RepairDetailPage({ params }: Props) {
  const t = await getTranslations('repair');
  const tCommon = await getTranslations('common');
  const tType = await getTranslations('repair.typeLabel');
  const tCap = await getTranslations('repair.inspectionCap');
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
  // 검사소는 운영시간이 '평일 09:00~18:00 · 토요일 09:00~13:00' 같은 원문 한 덩어리다
  // (구간이 둘 이상인 경우가 40% — 쪼개면 토요일이 사라진다). 있으면 그대로 보여준다.
  const hours = detail.hoursText
    ? detail.hoursText
    : detail.openTime
      ? detail.closeTime
        ? t('hoursRange', { open: detail.openTime, close: detail.closeTime })
        : t('hoursOpenOnly', { open: detail.openTime })
      : null;
  // 검사소일 때만 — 가능한 검사 종류(정기는 99.9%라 변별력이 없어 제외돼 온다).
  const caps = detail.inspectionCaps ?? [];

  // 주유소/EV/세차장 상세와 동일하게 라이트 전용(OS 다크모드여도 화이트로 통일).
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton ariaLabel={tCommon('backAria')} />
        <h1 className="flex-1 truncate font-bold text-gray-900">{detail.name}</h1>
      </header>

      <section className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {detail.brand && <RepairBrandBadge brand={detail.brand} size="md" forceLight />}
          <RepairTypeBadge type={detail.shopType} size="md" forceLight />
        </div>
        {/* 공식 분류명 — 뱃지는 짧은 말(카센터)을 쓰므로, 원천의 정확한 업종명은 여기 남긴다. */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] text-gray-400">{tType(detail.shopType)}</p>
          {/* 브랜드 제보 — 공공데이터에는 사업자 상호만 있어(예: '효원카') 실제 간판(공임나라)을
              알 방법이 없다. 지도 API 로 간판명을 긁어 저장하는 건 카카오·네이버 약관이 금지한다.
              사용자 제보가 유일한 합법 경로다. */}
          <CorrectionButton
            kind="repair_brand"
            targetId={id}
            currentBrand={detail.brand ?? null}
            callbackUrl={`/repair/${encodeURIComponent(id)}`}
          />
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
      </section>

      {/* 리뷰 — 주유소·세차장 상세와 동일 위치(부가 정보 섹션 바로 위).
          정비소 좌표를 넘겨 작성 전 지오펜스(근처에서만 작성) 안내/검증에 쓴다. */}
      <ReviewSection targetType="repair" targetId={id} lat={detail.lat} lng={detail.lng} />

      {/* 운영 정보 — 값이 있는 항목만 노출. 하나도 없으면 안내(원천 채움률이 낮아 흔한 경우다). */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">{t('operatingInfoTitle')}</h2>
        {hours || detail.institution || caps.length > 0 ? (
          <div className="space-y-2">
            {hours && <InfoRow icon={<ClockIcon className="h-4 w-4" />}>{hours}</InfoRow>}
            {caps.length > 0 && (
              <InfoRow icon={<CheckCircleIcon className="h-4 w-4" />}>
                <span className="flex flex-wrap gap-1">
                  {caps.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-800"
                    >
                      {tCap(c)}
                    </span>
                  ))}
                </span>
              </InfoRow>
            )}
            {typeof detail.laneCount === 'number' && detail.laneCount > 0 && (
              <InfoRow icon={<BuildingIcon className="h-4 w-4" />}>
                {t('laneCount', { count: detail.laneCount })}
              </InfoRow>
            )}
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

      {/* 긴급출동 — 고장으로 정비소를 찾는 맥락이라 여기서 필요할 수 있다.
          보험사 긴급출동이 견인·현장 조치를 해 주므로, 정비소로 가기 전에 부를 일이 많다. */}
      <section className="border-t border-gray-100 px-5 py-4">
        <Link
          href="/emergency"
          className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-3"
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold text-orange-900">
            <PhoneIcon className="h-4 w-4 text-primary" />
            {t('emergencyLink')}
          </span>
          <ChevronRightIcon className="h-4 w-4 text-orange-300" />
        </Link>
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
