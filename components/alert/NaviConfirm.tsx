'use client';

import { useState } from 'react';
import type { StationWithPrice } from '@/types/station';
import { BRAND_LABEL } from '@/types/station';
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
  /** 대상 종류. 'carwash'면 세차장 문구로 바꾸고 브랜드·가격 줄을 숨긴다(기본 'gas'). */
  kind?: 'gas' | 'carwash';
  onClose: () => void;
}

/**
 * "이 주유소로 길안내를 시작할까요?" 확인 모달.
 * 저장된 선호 앱이 있으면 원버튼으로 그 앱을 실행하고(+ "다른 앱으로" 전환),
 * 없으면 앱 목록에서 고르게 한다. 선택한 앱은 다음을 위해 기억한다.
 * 세차장(kind='carwash')은 가격이 없으므로 브랜드·가격 표기를 숨기고 명칭을 바꾼다(정직 표기).
 */
export function NaviConfirm({ station, origin, kind = 'gas', onClose }: Props) {
  // 대상 명칭·조사(주유소 '로' / 세차장 '으로'). 세차장은 가짜 가격 노출 금지.
  const noun = kind === 'carwash' ? '세차장' : '주유소';
  const to = kind === 'carwash' ? '으로' : '로';
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
      aria-label="길안내 시작 확인"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-900 sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold text-gray-900 dark:text-gray-50">
          {picking ? '어떤 앱으로 길안내할까요?' : `이 ${noun}${to} 길안내를 시작할까요?`}
        </p>
        <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-50">{station.name}</div>
          {kind === 'carwash' ? (
            distanceText && (
              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{distanceText}</div>
            )
          ) : (
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {BRAND_LABEL[station.brand]}{station.isSelf ? ' · 셀프' : ''}
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
              선택한 앱은 다음에 자동으로 사용돼요. 앱이 없으면 스토어/웹 안내로 연결됩니다.
            </p>
            <button
              onClick={onClose}
              disabled={starting}
              className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              취소
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
              {origin
                ? `현재 위치에서 이 ${noun}까지 ${preferredLabel} 길안내가 시작됩니다.`
                : `${preferredLabel}에서 이 ${noun}${to} 길안내가 시작됩니다.`}
              {' '}앱이 없으면 웹/스토어 안내로 열립니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                disabled={starting}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                취소
              </button>
              <button
                onClick={() => preferred && run(preferred)}
                disabled={starting || !preferred}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-60"
              >
                {starting ? '실행 중…' : `길안내 시작${preferredLabel ? ` (${preferredLabel})` : ''}`}
              </button>
            </div>
            <button
              onClick={() => setPicking(true)}
              disabled={starting}
              className="mt-1 w-full py-2 text-center text-xs font-medium text-gray-400 underline underline-offset-2 hover:text-gray-600 disabled:opacity-60 dark:text-gray-500 dark:hover:text-gray-300"
            >
              다른 앱으로
            </button>
          </>
        )}
      </div>
    </div>
  );
}
