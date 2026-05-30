'use client';

import { useState } from 'react';
import type { StationWithPrice } from '@/types/station';
import { BRAND_LABEL } from '@/types/station';
import { startKakaoNavi, type NaviOrigin } from '@/lib/map/navi';

interface Props {
  station: StationWithPrice;
  /** 출발지(현재 위치). 있으면 출발→도착 경로로 길안내가 시작된다. */
  origin?: NaviOrigin | null;
  onClose: () => void;
}

/**
 * "이 주유소로 길안내를 시작할까요?" 확인 모달.
 * 허용 시 카카오맵으로 도착지(가능하면 출발지까지) 설정된 길안내를 시작한다.
 */
export function NaviConfirm({ station, origin, onClose }: Props) {
  const [starting, setStarting] = useState(false);

  const distanceText = station.distance != null
    ? station.distance < 1000
      ? `${Math.round(station.distance)}m`
      : `${(station.distance / 1000).toFixed(1)}km`
    : null;

  async function handleStart() {
    setStarting(true);
    try {
      await startKakaoNavi({ name: station.name, lat: station.lat, lng: station.lng }, origin);
    } finally {
      setStarting(false);
      onClose();
    }
  }

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
          이 주유소로 길안내를 시작할까요?
        </p>
        <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-50">{station.name}</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {BRAND_LABEL[station.brand]}{station.isSelf ? ' · 셀프' : ''}
            {distanceText ? ` · ${distanceText}` : ''}
            {' · '}₩{station.price.toLocaleString()}
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
          {origin
            ? '현재 위치에서 이 주유소까지 카카오맵 길안내가 시작됩니다.'
            : '카카오맵에서 이 주유소로 길안내가 시작됩니다.'}
          {' '}앱이 없으면 웹 길찾기로 열립니다.
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
            onClick={handleStart}
            disabled={starting}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-60"
          >
            {starting ? '실행 중…' : '🧭 길안내 시작'}
          </button>
        </div>
      </div>
    </div>
  );
}
