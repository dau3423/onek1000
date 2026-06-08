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
import type { ProductCode } from '@/types/station';
import { PRODUCT_LABEL } from '@/types/station';

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
  const [trend, setTrend] = useState<PriceTrendResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // 마운트 시 오늘 이미 닫았는지 반영(SSR 안전을 위해 effect 안에서 읽음).
  useEffect(() => {
    setDismissed(isDismissedToday());
  }, []);

  // 좌표/유종 변경 시 추세 조회. 좌표는 ~1km(소수 2자리)로 양자화해 잦은 재호출 방지.
  useEffect(() => {
    if (lat == null || lng == null) {
      setTrend(null);
      return;
    }
    const qlat = lat.toFixed(2);
    const qlng = lng.toFixed(2);
    const ac = new AbortController();
    const params = new URLSearchParams({ lat: qlat, lng: qlng, product });
    fetch(`/api/price-trend?${params}`, { signal: ac.signal, cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as PriceTrendResponse) : null))
      .then((data) => setTrend(data))
      .catch((e) => {
        if (e?.name !== 'AbortError') setTrend(null);
      });
    return () => ac.abort();
  }, [lat, lng, product]);

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
      className="pointer-events-auto absolute inset-x-2 top-[calc(56px+44px+8px+env(safe-area-inset-top))] z-30 flex items-center gap-2 rounded-xl bg-expensive/95 px-3 py-3 text-white shadow-lg backdrop-blur"
      role="status"
    >
      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[11px] opacity-90">📈 내 지역 기름값 오름세</div>
          <button
            onClick={onDismiss}
            aria-label="알림 닫기"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-white/80 hover:bg-white/15 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="mt-0.5 text-base font-bold">오르기 전에 채우세요</div>
        <div className="text-[11px] opacity-90">
          {PRODUCT_LABEL[product]} 최근 7일 평균 {pctText} ↑
          {trend!.recentAvg ? ` · ₩${trend!.recentAvg.toLocaleString()}` : ''}
        </div>
      </div>
    </div>
  );
}
