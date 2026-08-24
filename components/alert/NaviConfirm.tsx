'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { StationWithPrice } from '@/types/station';
import { useBrandLabel } from '@/lib/i18n/labels';
import {
  startNavi,
  getPreferredNavi,
  setPreferredNavi,
  availableNaviProviders,
  NAVI_PROVIDER_LABEL,
  type NaviOrigin,
  type NaviProvider,
} from '@/lib/map/navi';
import { NaviAppButtons } from '@/components/alert/NaviApps';

interface Props {
  station: StationWithPrice;
  /** 출발지(현재 위치). 있으면 출발→도착 경로로 길안내가 시작된다. */
  origin?: NaviOrigin | null;
  /** 대상 종류. 'gas' 외에는 가격·브랜드 개념이 없어 그 줄을 숨기고 문구를 바꾼다(기본 'gas'). */
  kind?: 'gas' | 'carwash' | 'repair' | 'rental';
  onClose: () => void;
}

/**
 * "이 주유소로 길안내를 시작할까요?" 확인 모달.
 * 저장된 선호 앱이 있으면 원버튼으로 그 앱을 실행하고(+ "다른 앱으로" 전환),
 * 없으면 앱 목록에서 고르게 한다. 선택한 앱은 다음을 위해 기억한다.
 * 세차장·정비소·렌터카(kind!=='gas')는 가격이 없으므로 브랜드·가격 표기를 숨기고 명칭을 바꾼다(정직 표기).
 * (렌터카는 요금이 있지만 '지금 이 자리 가격'이 아니라 대여 요금이라 길안내 확인창에 띄우지 않는다.)
 */
export function NaviConfirm({ station, origin, kind = 'gas', onClose }: Props) {
  const t = useTranslations('station.navi');
  const tCommon = useTranslations('common');
  const tSelf = useTranslations('station');
  const brandLabelOf = useBrandLabel();
  const [starting, setStarting] = useState(false);
  // 선호 앱: 이 모달은 클릭 시에만 마운트되고 SSR되지 않으므로, lazy initializer에서
  // 동기 조회해 초기값을 바로 계산한다(마운트 후 useEffect 플립으로 인한 깜빡임 방지).
  const [preferred] = useState<NaviProvider | null>(() => {
    const saved = getPreferredNavi();
    return saved && availableNaviProviders().includes(saved) ? saved : null;
  });
  // 화면 모드 — false: 선호앱 원버튼 확인 / true: 앱 목록. 선호 앱이 없으면 곧장 목록.
  const [picking, setPicking] = useState(() => !preferred);

  const distanceText = station.distance != null
    ? station.distance < 1000
      ? `${Math.round(station.distance)}m`
      : `${(station.distance / 1000).toFixed(1)}km`
    : null;

  async function run(provider: NaviProvider) {
    setStarting(true);
    try {
      setPreferredNavi(provider);
      await startNavi(provider, { name: station.name, lat: station.lat, lng: station.lng }, origin);
    } finally {
      setStarting(false);
      onClose();
    }
  }

  const preferredLabel = preferred ? NAVI_PROVIDER_LABEL[preferred] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('confirmDialogAria')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-900 sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold text-gray-900 dark:text-gray-50">
          {picking ? t('whichApp') : t('confirmTitle', { kind })}
        </p>
        <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-50">{station.name}</div>
          {kind !== 'gas' ? (
            distanceText && (
              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{distanceText}</div>
            )
          ) : (
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {brandLabelOf(station.brand)}{station.isSelf ? ` · ${tSelf('self')}` : ''}
              {distanceText ? ` · ${distanceText}` : ''}
              {' · '}₩{station.price.toLocaleString()}
            </div>
          )}
        </div>

        {picking ? (
          <>
            <div className="mt-4">
              <NaviAppButtons onPick={run} disabled={starting} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
              {t('appHint')}
            </p>
            <button
              onClick={onClose}
              disabled={starting}
              className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {tCommon('cancel')}
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
              {origin
                ? t('startFromOrigin', { kind, provider: preferredLabel ?? '' })
                : t('startFromProvider', { kind, provider: preferredLabel ?? '' })}
              {' '}{t('webFallbackHint')}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                disabled={starting}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={() => preferred && run(preferred)}
                disabled={starting || !preferred}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-60"
              >
                {starting ? t('starting') : `${t('startNavigation')}${preferredLabel ? ` (${preferredLabel})` : ''}`}
              </button>
            </div>
            <button
              onClick={() => setPicking(true)}
              disabled={starting}
              className="mt-1 w-full py-2 text-center text-xs font-medium text-gray-400 underline underline-offset-2 hover:text-gray-600 disabled:opacity-60 dark:text-gray-500 dark:hover:text-gray-300"
            >
              {t('switchApp')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
