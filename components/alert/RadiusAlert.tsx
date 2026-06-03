'use client';

import { useEffect } from 'react';
import type { StationWithPrice } from '@/types/station';
import { BRAND_LABEL } from '@/types/station';
import { playAlertChime } from '@/lib/sound';

interface Props {
  station: StationWithPrice;
  averagePrice: number;
  onClick: () => void;
  onDismiss: () => void;
  /** 길안내(카카오내비) 시작 요청 — 확인 모달을 띄운다 */
  onNavigate?: () => void;
}

export function RadiusAlert({ station, averagePrice, onClick, onDismiss, onNavigate }: Props) {
  // 알람 배너가 새로 뜰 때(대상 주유소가 바뀔 때 포함) 짧은 효과음.
  // 이 컴포넌트는 알람 노출 조건에서만 마운트되므로, 마운트=배너 등장이다.
  // autoplay 차단 시 playAlertChime이 조용히 무시한다.
  useEffect(() => {
    playAlertChime();
  }, [station.id]);

  const diff = station.price - averagePrice;
  const distanceText = station.distance != null
    ? station.distance < 1000 ? `${Math.round(station.distance)}m` : `${(station.distance / 1000).toFixed(1)}km`
    : '';

  return (
    <div
      className="pointer-events-auto absolute inset-x-2 top-[calc(56px+44px+8px+env(safe-area-inset-top))] z-30 flex items-center gap-2 rounded-xl bg-cheap/95 px-3 py-3 text-white shadow-lg backdrop-blur"
      role="alert"
    >
      <div className="flex-1 cursor-pointer" onClick={onClick}>
        <div className="text-[11px] opacity-90">⚠ 1km 안에 더 싼 곳!</div>
        <div className="mt-0.5 text-sm font-bold">
          ₩{station.price.toLocaleString()}
          <span className="ml-1.5 text-[11px] font-normal opacity-90">
            ({diff}원 · 평균 대비)
          </span>
        </div>
        <div className="text-[11px] opacity-90">
          {BRAND_LABEL[station.brand]} {station.name} · {distanceText}
        </div>
      </div>
      {onNavigate && (
        <button
          onClick={onNavigate}
          aria-label="길안내 시작"
          title="카카오내비 길안내"
          className="shrink-0 rounded-lg bg-white/20 px-2.5 py-2 text-sm font-bold text-white hover:bg-white/30"
        >
          길안내
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="알림 닫기"
        className="ml-1 rounded-full p-1 text-white/80 hover:bg-white/15 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
