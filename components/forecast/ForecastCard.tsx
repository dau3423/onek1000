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
import { PRODUCT_LABEL, SIDO_NAME } from '@/types/station';
import { ForecastChart, type ForecastSeriesPoint, type ForecastBand } from './ForecastChart';
import ForecastSavingsSim from './ForecastSavingsSim';
import ForecastDrivers from './ForecastDrivers';
import ForecastHistory from './ForecastHistory';

export type Direction = 'up' | 'flat' | 'down';

// 상승·하락 한정 적중률(공개). directionalHitRate=0~1, n=0이면 null. windowDays=0이면 전체기간.
export interface ForecastAccuracy {
  directionalHitRate: number | null;
  n: number;
  windowDays: number;
}

// 복기 타임라인 1건(채점 완료). actualChangePct=실측 변화율(%), hit=적중 여부.
export interface ForecastHistoryItem {
  forecastDate: string;
  targetDate: string;
  direction: Direction;
  confidence: number;
  actualChangePct: number;
  hit: boolean;
}

// 선행지표 근거(전국 단일). 각 지표 변화율%(유효 표본 부족 시 개별 null).
export interface ForecastDriversData {
  mopsChangePct: number | null;
  usdkrwChangePct: number | null;
  dubaiChangePct: number | null;
  windowDays: number;
}

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
  accuracy: ForecastAccuracy | null;
  history: ForecastHistoryItem[];
  drivers: ForecastDriversData | null;
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
  // 지역 전환은 내부 상태로 관리(prop은 초기값으로만 사용). 변경 시 자동 재조회.
  const [selectedRegion, setSelectedRegion] = useState<string>(region ?? 'nation');

  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams({ product, region: selectedRegion });
    fetch(`/api/forecast?${params}`, { signal: ac.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as ForecastResponse) : null))
      .then((d) => setData(d))
      .catch((e) => {
        if (e?.name !== 'AbortError') setData(null);
      });
    return () => ac.abort();
  }, [product, selectedRegion]);

  // 딥링크 자동 펼침 — 미니카드/푸시가 /?forecast=1 로 진입하면 추이 그래프를 기본 펼침.
  //   SSR/hydration 안전을 위해 mount 후 useEffect 안에서만 window/URLSearchParams 접근.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('forecast') === '1') {
      setExpanded(true);
    }
  }, []);

  const latest = data?.latest ?? null;
  // graceful 분기:
  //  - latest 있으면 정상 카드.
  //  - latest 없고 지역(시도) 선택 중이면 '데이터 축적 중' 안내 + 전국 전환 버튼(빈 화면 금지).
  //  - latest 없고 전국이면 컴포넌트 전체 미렌더(다른 배너처럼 조용히).
  if (!latest) {
    if (selectedRegion !== 'nation') {
      const sidoName = SIDO_NAME[selectedRegion as keyof typeof SIDO_NAME] ?? '이 지역';
      return (
        <section className="mx-3 mb-3 mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
            ⛽ {PRODUCT_LABEL[product]} 주유 타이밍 전망
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {sidoName} 지역은 데이터 축적 중이에요.
          </p>
          <button
            type="button"
            onClick={() => setSelectedRegion('nation')}
            className="mt-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
          >
            전국 기준으로 보기
          </button>
        </section>
      );
    }
    return null;
  }

  const { direction, confidence, targetDate } = latest;
  // confidence 0 이거나 저신뢰면 '약한 신호' 톤. flat 은 본래 중립이라 단정 카피를 쓰지 않음.
  const weak = confidence < LOW_CONF_PCT || confidence === 0;
  const meta = DIR_META[direction];
  const copy = weak ? meta.weakCopy : meta.copy;
  const badgeClass = weak ? meta.badgeWeak : meta.badge;
  const productLabel = PRODUCT_LABEL[product];
  // 그래프 캡션용 지역 라벨 — 전국=nation, 그 외 시도명. 선택 region을 반영(시도 선택 시 '전국' 오표기 방지).
  const regionLabel = selectedRegion === 'nation'
    ? '전국'
    : (SIDO_NAME[selectedRegion as keyof typeof SIDO_NAME] ?? '선택 지역');

  // 정확도(실측 적중률) 상시 표시 — '신뢰도'(모델 신호강도)와는 별개.
  //   과소표본 오해 방지를 위해 n>=5(임계) + directionalHitRate 존재할 때만 노출.
  const acc = data?.accuracy ?? null;
  const showAccuracy = acc != null && acc.directionalHitRate != null && acc.n >= 5;
  const accPct = showAccuracy ? Math.round((acc!.directionalHitRate as number) * 100) : null;
  const accWindowLabel = showAccuracy ? (acc!.windowDays > 0 ? `최근 ${acc!.windowDays}일` : '전체') : '';

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

      {/* 지역 전환 — 전국 + 시도별. 선택 시 자동 재조회(같은 data로 그래프/복기/시뮬/근거 전부 반영). */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <select
          aria-label="예측 지역 선택"
          value={selectedRegion}
          onChange={(e) => setSelectedRegion(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          <option value="nation">전국</option>
          {Object.entries(SIDO_NAME).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        {/* 정확도(실측 적중률) 상시 표시 — '신뢰도'(모델 신호강도)와 구분. */}
        {showAccuracy ? (
          <span className="text-[11px] text-gray-400">
            {accWindowLabel}(상승·하락 예측) 정확도 {accPct}%
          </span>
        ) : null}
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
            최근 {data.series.length}일 {regionLabel} 평균 소매가(실측) · 점선/음영은 단순 투영(참고용)
          </p>
          {/* 부가: 절감 시뮬(C5) → 선행지표 근거(C6) → 복기 타임라인(B). 각자 null 가드 보유. */}
          <ForecastSavingsSim band={data.band} direction={direction} />
          <ForecastDrivers drivers={data.drivers} direction={direction} />
          <ForecastHistory history={data.history} />
        </div>
      ) : null}
    </section>
  );
}
