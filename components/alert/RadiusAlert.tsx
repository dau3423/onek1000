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

  // 평균 대비 차액(이 주유소 가격 - 화면 평균가). 평균보다 싸면 음수.
  // averagePrice가 유효(양수)할 때만 "(±N원 · 평균 대비)"를 표시하고,
  // 구할 수 없으면 그 부분을 생략해 가격만 굵게 보여준다(graceful).
  const hasAvg = Number.isFinite(averagePrice) && averagePrice > 0;
  const diff = station.price - averagePrice;
  // 음수면 "-72원", 양수면 "+72원"(평균보다 비싼데도 노출된 경우 방어), 0이면 "평균 수준".
  const diffText = diff === 0 ? '평균 수준' : `${diff > 0 ? '+' : '-'}${Math.abs(diff).toLocaleString()}원`;
  const distanceText = station.distance != null
    ? station.distance < 1000 ? `${Math.round(station.distance)}m` : `${(station.distance / 1000).toFixed(1)}km`
    : '';

  return (
    <div
      className="pointer-events-auto absolute inset-x-2 top-[calc(56px+44px+8px+env(safe-area-inset-top))] z-30 flex items-center gap-2 rounded-xl bg-cheap/95 px-3 py-3 text-white shadow-lg backdrop-blur"
      role="alert"
    >
      <div className="flex-1">
        {/* 1행(헤더): 좌측 경고 라벨 + 우측 끝 닫기 버튼 */}
        <div className="flex items-start justify-between gap-2">
          <div className="cursor-pointer text-[11px] opacity-90" onClick={onClick}>⚠ 1km 안에 더 싼 곳!</div>
          <button
            onClick={onDismiss}
            aria-label="알림 닫기"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-white/80 hover:bg-white/15 hover:text-white"
          >
            ✕
          </button>
        </div>
        {/* 2행 + 3행: 탭하면 상세로 이동 */}
        <div className="cursor-pointer" onClick={onClick}>
          <div className="mt-0.5 text-base font-bold">
            ₩{station.price.toLocaleString()}
            {hasAvg && (
              <span className="ml-1.5 text-[11px] font-normal opacity-90">
                ({diffText} · 평균 대비)
              </span>
            )}
          </div>
          <div className="text-[11px] opacity-90">
            {BRAND_LABEL[station.brand]} {station.name}{distanceText ? ` · ${distanceText}` : ''}
          </div>
        </div>
      </div>
      {onNavigate && (
        <button
          onClick={onNavigate}
          aria-label="길안내 시작"
          title="카카오내비 길안내"
          className="shrink-0 self-center rounded-lg bg-white/20 px-2.5 py-2 text-sm font-bold text-white hover:bg-white/30"
        >
          길안내
        </button>
      )}
    </div>
  );
}
