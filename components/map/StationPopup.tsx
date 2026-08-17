'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { StationWithPrice } from '@/types/station';
import { BRAND_COLOR } from '@/types/station';
import { useBrandLabel, useProductLabel } from '@/lib/i18n/labels';
import { CloseIcon } from '@/components/icons';

interface Props {
  station: StationWithPrice;
  /** 닫기(바깥 클릭/ESC/닫기 버튼) */
  onClose: () => void;
  /** "상세보기" — 상세 페이지(/station/{id})로 이동 */
  onDetail: () => void;
  /** "길안내" — 카카오내비 확인 모달 요청 */
  onNavigate: () => void;
}

/**
 * PC(데스크톱) 화면에서 지도 마커 클릭 시 노출하는 요약 정보 카드 모달.
 * 마커 데이터(StationWithPrice)만으로 채울 수 있는 정보를 보여주고,
 * 길안내 / 상세보기로 이어준다. (모바일은 기존대로 상세 페이지 직접 이동)
 *
 * NaviConfirm과 디자인 톤(둥근 모서리/다크모드/오버레이/포커스)을 맞춘다.
 */
export function StationPopup({ station, onClose, onDetail, onNavigate }: Props) {
  const t = useTranslations('map');
  const tCommon = useTranslations('common');
  const brandLabel = useBrandLabel();
  const productLabel = useProductLabel();
  const cardRef = useRef<HTMLDivElement>(null);

  // ESC 닫기 + 마운트 시 카드로 포커스 이동(접근성)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    cardRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const distanceText = station.distance != null
    ? station.distance < 1000
      ? `${Math.round(station.distance)}m`
      : `${(station.distance / 1000).toFixed(1)}km`
    : null;

  const brandColor = BRAND_COLOR[station.brand] ?? '#666';

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
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: brandColor }}
                aria-hidden
              />
              <span className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                {brandLabel(station.brand)}{station.isSelf ? ` · ${t('selfService')}` : ''}
              </span>
            </div>
            <h2 className="mt-1 truncate text-base font-bold text-gray-900 dark:text-gray-50">
              {station.name}
            </h2>
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
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('stationPopup.currentPrice', { product: productLabel(station.product) })}
          </div>
          <div className="mt-0.5 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            ₩{station.price.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-gray-400 dark:text-gray-500">/L</span>
          </div>
          {distanceText && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('stationPopup.distanceFromMe', { distance: distanceText })}
            </div>
          )}
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
