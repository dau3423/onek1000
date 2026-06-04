'use client';

import { useEffect } from 'react';
import type { StationWithPrice } from '@/types/station';
import { BRAND_LABEL } from '@/types/station';
import { playAlertChime, notifyRouteAlert, isNotifyGranted } from '@/lib/sound';

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
  // "N00m 앞" — 100m 단위 반올림(1km 미만), 그 이상은 km.
  const distanceText = distanceM < 1000
    ? `${Math.max(100, Math.round(distanceM / 100) * 100)}m`
    : `${(distanceM / 1000).toFixed(1)}km`;

  // 새 대상으로 배너가 바뀔 때 1회(마운트=등장):
  //  - 큰 인앱 알림음을 항상 보장(playAlertChime). autoplay 차단 시 조용히 무시.
  //  - 권한이 granted면 OS 시스템 알림도 함께 시도(추가/폴백). 권한 요청은 여기서 하지 않는다
  //    (무분별 요청 금지 — app/page.tsx의 사용자 인터랙션 핸들러에서 ensureNotifyPermission로 확보).
  //  - 시스템 알림과 인앱음이 동시에 나도 과하지 않게, granted일 땐 인앱음을 약간(0.8) 낮춘다.
  useEffect(() => {
    const granted = isNotifyGranted();
    playAlertChime(granted ? 0.8 : 1);
    if (granted) {
      notifyRouteAlert({
        title: '🚗 경로상 최저가 주유소',
        body: `${station.name} · ₩${station.price.toLocaleString()} (${BRAND_LABEL[station.brand]}) · ${distanceText} 앞`,
        tag: `route-alert-${station.id}`,
      });
    }
    // station.id 변경(=새 대상 등장) 시에만 발화. distanceM 변동으론 재발화하지 않음(리렌더 반복 금지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.id]);

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
