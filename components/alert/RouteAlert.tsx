'use client';

import { useEffect } from 'react';
import type { StationWithPrice } from '@/types/station';
import { BRAND_LABEL } from '@/types/station';
import { playAlertChime } from '@/lib/sound';

interface Props {
  /** 근접한 경로 최저가 주유소 */
  station: StationWithPrice;
  /** 현재 위치로부터의 직선 거리(m) — "N00m 앞" 표기에 사용 */
  distanceM: number;
  /** 배너 본문 탭 — 해당 주유소로 포커스/상세 이동 */
  onClick: () => void;
  /** 배너 닫기 */
  onDismiss: () => void;
  /** 길안내(카카오내비) 시작 요청 — 확인 모달을 띄운다 */
  onNavigate?: () => void;
}

/**
 * 경로 주행 중 근접 알림 배너 — 경로 모드(routePlan 활성)에서 GPS로 주행하다가
 * 경로상 최저가 주유소에 1km 이내로 접근하면 노출한다(인앱 팝업 + 효과음).
 * 기존 내 주변 RadiusAlert와 형태를 맞추되, "경로상 최저가" 문구로 구분한다.
 */
export function RouteAlert({ station, distanceM, onClick, onDismiss, onNavigate }: Props) {
  // 새 대상으로 배너가 바뀔 때 짧은 효과음(마운트=등장). autoplay 차단 시 조용히 무시.
  useEffect(() => {
    playAlertChime();
  }, [station.id]);

  // "N00m 앞" — 100m 단위 반올림(1km 미만), 그 이상은 km.
  const distanceText = distanceM < 1000
    ? `${Math.max(100, Math.round(distanceM / 100) * 100)}m`
    : `${(distanceM / 1000).toFixed(1)}km`;

  return (
    <div
      className="pointer-events-auto absolute inset-x-2 top-[calc(56px+44px+8px+env(safe-area-inset-top))] z-40 flex items-center gap-2 rounded-xl bg-primary/95 px-3 py-3 text-white shadow-lg backdrop-blur"
      role="alert"
    >
      <div className="flex-1 cursor-pointer" onClick={onClick}>
        <div className="text-[11px] opacity-90">🚗 경로상 최저가 주유소 {distanceText} 앞!</div>
        <div className="mt-0.5 text-sm font-bold">
          ₩{station.price.toLocaleString()}
          <span className="ml-1.5 text-[11px] font-normal opacity-90">
            ({BRAND_LABEL[station.brand]})
          </span>
        </div>
        <div className="text-[11px] opacity-90">{station.name}</div>
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
