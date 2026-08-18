'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { StationWithPrice } from '@/types/station';
import { useBrandLabel } from '@/lib/i18n/labels';
import { playAlertChime, notifyRouteAlert, isNotifyGranted } from '@/lib/sound';
import { CarIcon, CloseIcon } from '@/components/icons';

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
  const t = useTranslations('alert');
  const tCommon = useTranslations('common');
  const tMap = useTranslations('map.bottomSheet');
  const brandLabel = useBrandLabel();
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
        title: t('route.notifTitle'),
        body: t('route.notifBody', {
          name: station.name,
          price: station.price.toLocaleString(),
          brand: brandLabel(station.brand),
          distance: distanceText,
        }),
        tag: `route-alert-${station.id}`,
      });
    }
    // station.id 변경(=새 대상 등장) 시에만 발화. distanceM 변동으론 재발화하지 않음(리렌더 반복 금지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.id]);

  return (
    <div
      className="pointer-events-auto absolute inset-x-2 top-[calc(56px+44px+8px+env(safe-area-inset-top))] z-40 flex items-center gap-2 rounded-xl bg-primary/95 py-3 pl-3 pr-12 text-white shadow-lg backdrop-blur"
      role="alert"
    >
      {/* 닫기: 우측 상단 모서리 고정 + 반투명 원형 배경으로 가시성 확보(RadiusAlert와 일관).
          상세 이동/길안내 클릭과 분리하기 위해 stopPropagation. */}
      {/* 배너형 예외 40px(h-10): 3줄 배너 텍스트가 좁아 44px 히트영역은 본문을 침범한다.
          right-1 top-1 오프셋으로 배너 박스 크기는 불변(§4-2). */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label={tCommon('close')}
        className="absolute right-1 top-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/35 active:bg-black/40"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onClick}>
        <div className="flex items-center gap-1 text-[11px] opacity-90">
          <CarIcon className="h-3.5 w-3.5" />{t('route.bannerLabel', { distance: distanceText })}
        </div>
        <div className="mt-0.5 text-sm font-bold">
          ₩{station.price.toLocaleString()}
          <span className="ml-1.5 text-[11px] font-normal opacity-90">
            ({brandLabel(station.brand)})
          </span>
        </div>
        <div className="truncate text-[11px] opacity-90">{station.name}</div>
      </div>
      {onNavigate && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          aria-label={t('navigateAria')}
          title={tMap('kakaoNaviTitle')}
          className="shrink-0 self-end rounded-lg bg-white/20 px-2.5 py-2 text-sm font-bold text-white hover:bg-white/30"
        >
          {tCommon('navigate')}
        </button>
      )}
    </div>
  );
}
