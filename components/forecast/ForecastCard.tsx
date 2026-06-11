'use client';

// 주유 타이밍 예측 — 메인 예측 카드.
// 현재 선택 유종(product) 기준으로 /api/forecast 조회 → 방향 배지 + 한 줄 추천 + 추이 그래프(탭 시 확장).
//  - 데이터 출처: 우리 DB(price_forecast / domestic_price_daily)만. 비로그인 포함 전체 사용자.
//  - 정확도(hit-rate)는 노출하지 않는다(내부 전용). 여기선 신뢰도%만 표시.
//  - 저신뢰(<LOW_CONF_PCT)면 단정 카피 대신 '약한 신호' 톤 + 배지/색을 흐리게(과장 금지).
//  - 신호 없음/결측(비대상 유종·USE_MOCK·DB 미설정)이면 카드 자체를 렌더하지 않음(graceful).
//
// 데이터 페칭: 기존 사이드 컴포넌트(PriceTrendBanner / PriceHistoryChart)와 동일하게
//   useEffect + fetch 패턴을 따른다(코드베이스에 react-query 미도입 — 불필요 의존성 추가 회피).

import { useEffect, useState } from 'react';
import type { ProductCode } from '@/types/station';
import { PRODUCT_LABEL } from '@/types/station';
import { ForecastChart, type ForecastSeriesPoint, type ForecastBand } from './ForecastChart';

type Direction = 'up' | 'flat' | 'down';

interface ForecastResponse {
  product: string;
  region: string;
  latest: {
    direction: Direction;
    confidence: number;
    forecastDate: string;
    targetDate: string;
    horizonDays: number;
  } | null;
  series: ForecastSeriesPoint[];
  band: ForecastBand | null;
  modelVersion: string;
  asOf: string;
}

interface Props {
  product: ProductCode;
  region?: string;
}

// 이 미만이면 '약한 신호' 톤(단정 금지, 배지/색 흐리게). 최신 모델 신뢰도가 낮은 편(0~35%)이라 중요.
const LOW_CONF_PCT = 20;

// 방향별 표시 메타(배지/색/카피). 색은 마커 톤(상승=경고, 하락=차분한 파랑, 보합=중립)과 일관.
const DIR_META: Record<Direction, {
  arrow: string;
  label: string; // 배지 라벨
  copy: string; // 단정 추천 카피
  weakCopy: string; // 저신뢰 톤 카피
  badge: string; // 배지 색 클래스(고신뢰)
  badgeWeak: string; // 배지 색 클래스(저신뢰: 흐리게)
}> = {
  up: {
    arrow: '▲',
    label: '상승 예상',
    copy: '오를 전망 — 지금 채우는 게 유리해요',
    weakCopy: '약하게 오를 가능성 — 참고만 하세요',
    badge: 'bg-expensive/10 text-expensive',
    badgeWeak: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
  down: {
    arrow: '▼',
    label: '하락 예상',
    copy: '내릴 전망 — 급하지 않으면 며칠 기다려도 좋아요',
    weakCopy: '약하게 내릴 가능성 — 참고만 하세요',
    badge: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    badgeWeak: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
  flat: {
    arrow: '─',
    label: '보합 예상',
    copy: '당분간 큰 변동은 적을 전망',
    weakCopy: '당분간 큰 변동은 적을 전망',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    badgeWeak: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
};

export function ForecastCard({ product, region = 'nation' }: Props) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams({ product, region });
    fetch(`/api/forecast?${params}`, { signal: ac.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as ForecastResponse) : null))
      .then((d) => setData(d))
      .catch((e) => {
        if (e?.name !== 'AbortError') setData(null);
      });
    return () => ac.abort();
  }, [product, region]);

  const latest = data?.latest ?? null;
  // graceful: 예측 신호가 없으면 카드를 렌더하지 않는다(다른 배너처럼 조용히).
  if (!latest) return null;

  const { direction, confidence, targetDate } = latest;
  // confidence 0 이거나 저신뢰면 '약한 신호' 톤. flat 은 본래 중립이라 단정 카피를 쓰지 않음.
  const weak = confidence < LOW_CONF_PCT || confidence === 0;
  const meta = DIR_META[direction];
  const copy = weak ? meta.weakCopy : meta.copy;
  const badgeClass = weak ? meta.badgeWeak : meta.badge;
  const productLabel = PRODUCT_LABEL[product];

  return (
    <section className="mx-3 mb-3 mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
            ⛽ {productLabel} 주유 타이밍 전망
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${badgeClass}`}>
              <span aria-hidden>{meta.arrow}</span>
              {weak ? '약한 신호' : meta.label}
            </span>
          </div>
          <p className={`mt-2 text-sm font-semibold ${weak ? 'text-gray-600 dark:text-gray-300' : 'text-gray-900 dark:text-gray-100'}`}>
            {copy}
          </p>
        </div>
        {/* 신뢰도% — 정확도(hit-rate)가 아니라 모델 신뢰도. 저신뢰면 흐리게. */}
        <div className="shrink-0 text-right">
          <div className={`text-lg font-bold ${weak ? 'text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}>
            {Math.round(confidence)}%
          </div>
          <div className="text-[10px] text-gray-400">신뢰도</div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>
          향후 {latest.horizonDays}일 전망(모델 {data?.modelVersion}) · {targetDate}까지
        </span>
        {data?.series.length ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full px-2 py-0.5 font-medium text-primary hover:bg-primary/10"
            aria-expanded={expanded}
          >
            {expanded ? '그래프 접기' : '추이 보기'}
          </button>
        ) : null}
      </div>

      {expanded && data?.series.length ? (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          <ForecastChart series={data.series} band={data.band} direction={direction} weak={weak} />
          <p className="mt-1 text-[10px] text-gray-400">
            최근 {data.series.length}일 전국평균 소매가(실측) · 점선/음영은 단순 투영(참고용)
          </p>
        </div>
      ) : null}
    </section>
  );
}
