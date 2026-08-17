'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { EvStationMarker } from '@/types/ev';
import { relativeFromNow } from '@/lib/ev/format';
import { BoltIcon, CloseIcon } from '@/components/icons';

interface Props {
  station: EvStationMarker;
  onClose: () => void;
  /** "상세보기" — 충전소 상세(/ev/{statId})로 이동 */
  onDetail: () => void;
  /** "길안내" — 카카오내비 확인 모달 요청 */
  onNavigate: () => void;
}

// EvChargerStatusPanel의 charger 단위 상대시간과 동형: null="갱신 정보 없음"(고정),
// 60초 미만="방금 전"(고정), 그 이상은 relativeFromNow(Intl)에 위임.
function statusRelative(iso: string | null, locale: string, tEv: (key: string) => string): string {
  if (!iso) return tEv('noUpdateInfo');
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return tEv('noUpdateInfo');
  if (Date.now() - ms < 60_000) return tEv('justNow');
  return relativeFromNow(iso, locale);
}

/**
 * PC(데스크톱)에서 충전소 마커 클릭 시 노출하는 요약 정보 카드 모달.
 * StationPopup(주유소)과 톤을 맞추되, 가격 대신 사용가능/전체 충전기·급속/완속·운영기관·최근 갱신을 보여준다.
 */
export function EvStationPopup({ station, onClose, onDetail, onNavigate }: Props) {
  const t = useTranslations('map');
  const tCommon = useTranslations('common');
  const tEv = useTranslations('ev');
  const locale = useLocale();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    cardRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const available = station.availableChargers > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('popup.infoAria', { name: station.name })}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl outline-none dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400" aria-hidden>
                <BoltIcon className="h-3.5 w-3.5" />
                {t('evPopup.label')}
              </span>
            </div>
            <h2 className="mt-1 truncate text-base font-bold text-gray-900 dark:text-gray-50">
              {station.name}
            </h2>
            {station.busiNm && (
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{station.busiNm}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={tCommon('close')}
            className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('available')}</span>
            <span className={`text-2xl font-extrabold ${available ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {station.availableChargers}
              <span className="ml-1 text-sm font-medium text-gray-400 dark:text-gray-500">{t('chargerCount', { count: station.totalChargers })}</span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {station.hasFast && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{t('fastCharge')}</span>
            )}
            {station.hasSlow && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">{t('slowCharge')}</span>
            )}
            {station.maxOutput != null && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">{t('evPopup.maxOutput', { value: station.maxOutput })}</span>
            )}
          </div>
          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            {t('evPopup.statusUpdated', { relative: statusRelative(station.latestStatUpdAt, locale, tEv) })}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onNavigate}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {tCommon('navigate')}
          </button>
          <button
            onClick={onDetail}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary-dark"
          >
            {tCommon('viewDetail')}
          </button>
        </div>
      </div>
    </div>
  );
}
