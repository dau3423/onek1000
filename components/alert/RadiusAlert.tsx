'use client';

import type { StationWithPrice } from '@/types/station';
import { BRAND_LABEL } from '@/types/station';

interface Props {
  station: StationWithPrice;
  averagePrice: number;
  onClick: () => void;
  onDismiss: () => void;
}

export function RadiusAlert({ station, averagePrice, onClick, onDismiss }: Props) {
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
      <button
        onClick={onDismiss}
        aria-label="알림 닫기"
        className="ml-2 rounded-full p-1 text-white/80 hover:bg-white/15 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
