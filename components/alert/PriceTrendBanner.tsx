'use client';

// ④ 가격 추세/타이밍 인앱 배너 (전체 사용자, 비로그인 포함)
//
// 내 지역(현재 위치 또는 지도 중심) 반경의 기름값이 "오름세"이고 임계(+1.5% 이상)면
// "오르기 전에 채우세요" 배너를 상단에 노출한다.
//  - 데이터 출처: /api/price-trend (우리 DB prices_history만, 외부 API 무관).
//  - 과도노출 방지: 닫으면 localStorage로 하루 1회만 억제(유종 무관 단일 키).
//  - 추세 미산출/내림세/보합이면 배너를 띄우지 않는다(graceful, 본 지도 영향 0).
//  - 위치는 좌표를 ~1km(소수 2자리)로 양자화해 같은 지역에서 잦은 재호출을 막는다.

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ProductCode } from '@/types/station';
import { useProductLabel } from '@/lib/i18n/labels';
import { TrendUpIcon, CloseIcon } from '@/components/icons';

interface PriceTrendResponse {
  trend: 'up' | 'down' | 'flat' | null;
  changePct: number | null;
  recentAvg: number | null;
  priorAvg: number | null;
  recentN: number;
  priorN: number;
  basis: string;
}

interface Props {
  /** 기준 좌표(현재 위치 또는 지도 중심). null이면 미표시. */
  lat: number | null;
  lng: number | null;
  product: ProductCode;
}

// 오름세 배너를 띄우는 변동률 임계(%). +1.5% 이상 오를 때만 "채우세요" 신호.
const UP_THRESHOLD_PCT = 1.5;
// 하루 1회 억제 키(유종 무관). 날짜(YYYY-MM-DD)와 다르면 다시 노출.
const DISMISS_KEY = 'priceTrendBannerDismissedAt';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === todayStr();
  } catch {
    return false;
  }
}

export function PriceTrendBanner({ lat, lng, product }: Props) {
  const t = useTranslations('alert.priceTrend');
  const productLabel = useProductLabel();
  const [trend, setTrend] = useState<PriceTrendResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // 마운트 시 오늘 이미 닫았는지 반영(SSR 안전을 위해 effect 안에서 읽음).
  useEffect(() => {
    setDismissed(isDismissedToday());
  }, []);

  // 좌표를 ~1km(소수 2자리)로 양자화한다. **렌더 중에 계산해 의존성 배열에 넣는 것이 핵심이다** —
  // 예전에는 URL 파라미터만 양자화하고 deps는 raw 좌표라, 양자화가 재호출을 전혀 줄이지 못했다.
  // 이 컴포넌트의 lat/lng는 geo.coords(watchPosition) 또는 지도 idle의 mapCenter라, 주행 중에는
  // 초당 1회꼴로 새 값이 들어온다. /api/price-trend는 반경 5km × 최근 7일 vs 직전 7일
  // prices_history 집계라 가볍지 않고, 배너는 오름세일 때만 보이므로 화면에 아무것도 없는
  // 상태로 그 부하가 계속 나갔다.
  const qlat = lat == null ? null : lat.toFixed(2);
  const qlng = lng == null ? null : lng.toFixed(2);

  useEffect(() => {
    if (qlat == null || qlng == null) {
      setTrend(null);
      return;
    }
    const ac = new AbortController();
    const params = new URLSearchParams({ lat: qlat, lng: qlng, product });
    fetch(`/api/price-trend?${params}`, { signal: ac.signal, cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as PriceTrendResponse) : null))
      .then((data) => setTrend(data))
      .catch((e) => {
        if (e?.name !== 'AbortError') setTrend(null);
      });
    return () => ac.abort();
  }, [qlat, qlng, product]);

  const show =
    !dismissed &&
    trend?.trend === 'up' &&
    typeof trend.changePct === 'number' &&
    trend.changePct >= UP_THRESHOLD_PCT;

  if (!show) return null;

  const pctText = `+${trend!.changePct!.toFixed(1)}%`;

  const onDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, todayStr());
    } catch {
      /* 저장 실패 무시 — 세션 내 닫힘만 유지 */
    }
  };

  return (
    <div
      className="pointer-events-auto absolute inset-x-2 top-[calc(56px+44px+8px+env(safe-area-inset-top))] z-30 flex items-center gap-2 rounded-xl bg-expensive/95 py-3 pl-3 pr-12 text-white shadow-lg backdrop-blur"
      role="status"
    >
      {/* 배너형 예외 40px(h-10): 배너 텍스트 폭이 좁아 44px 히트영역은 본문을 침범한다.
          right-1 top-1 오프셋으로 배너 박스 크기는 불변(§4-2). */}
      <button
        onClick={onDismiss}
        aria-label={t('closeAria')}
        className="absolute right-1 top-1 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/15 hover:text-white"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-1 text-[11px] opacity-90">
          <TrendUpIcon className="h-3.5 w-3.5" />{t('risingLabel')}
        </div>
        <div className="mt-0.5 text-base font-bold">{t('heading')}</div>
        <div className="text-[11px] opacity-90">
          {t('stats', {
            product: productLabel(product),
            pct: pctText,
            avgSuffix: trend!.recentAvg ? ` · ₩${trend!.recentAvg.toLocaleString()}` : '',
          })}
        </div>
      </div>
    </div>
  );
}
