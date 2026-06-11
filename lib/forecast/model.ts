// 주유 타이밍 예측 v1 — 순수함수 모델(시계열 in → 예측 out).
//
// 외부 의존 없음(DB/네트워크 없음)으로 단위 동작 검증이 쉽다. 입력은 "날짜순 정렬된
// 선행지표/국내가 시계열"이고, 출력은 특정 forecast_date 시점의 방향성 예측이다.
//
// 핵심 아이디어(설명가능):
//   1) 선행지표 LI_t = MOPS(유종) × USDKRW  → maWindow 이동평균으로 디노이즈.
//   2) 신호 = 최근 signalWindow 일 LI 로그변화(국제가가 이미 움직인 폭).
//   3) 그 중 "아직 국내가에 전가 안 된 부분"만 향후 horizon 국내 변화로 추정:
//        예상 국내변화% ≈ elasticity × LI로그변화 × (1 - passthroughDone)
//   4) 데드밴드로 up/flat/down 판정.
//   5) confidence% = (신호의 z-score / zCap) → 0~100, 데이터 짧으면 하향.

import { type ForecastConfig } from './config';

export type Direction = 'up' | 'flat' | 'down';

/** 날짜순(오름차순) 시계열 한 점. value 가 null 이면 결측. */
export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number | null;
}

export interface ForecastInput {
  /** 선행지표 원지표: LI = mops × usdkrw 를 미리 곱한 일별 시계열(오름차순). */
  li: SeriesPoint[];
  /** 국내 전국평균 소매가 일별 시계열(오름차순). confidence 변동성 산출에 사용. */
  domestic: SeriesPoint[];
}

export interface ForecastResult {
  ok: boolean;
  /** 예측 생략 사유(ok=false 일 때). 데이터 부족 등. */
  reason?: string;
  direction: Direction;
  confidence: number; // 0~100
  /** 예상 국내 변화율(%) — 디버그/추이 표시용. */
  expectedChangePct: number;
  /** 신호: 최근 signalWindow LI 로그변화(%). */
  signalPct: number;
  /** 사용한 forecast_date(li 시계열의 마지막 유효일). */
  forecastDate: string | null;
}

/** 결측 제거 후 [date,value] 만 남긴다(오름차순 가정 유지). */
function compact(series: SeriesPoint[]): Array<{ date: string; value: number }> {
  return series
    .filter((p): p is { date: string; value: number } => p.value != null && Number.isFinite(p.value))
    .map((p) => ({ date: p.date, value: p.value }));
}

/** 끝에서부터 window 길이의 단순 이동평균값(마지막 점 기준). 표본 부족이면 null. */
function trailingMA(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(values.length - window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** 인접 로그변화(diff of log) 배열. 0/음수 값은 건너뛴다. */
function logReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

/** 표본표준편차(n-1). 표본<2면 null. */
function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * forecast_date 시점 예측 산출(순수함수).
 * - li/domestic 은 forecast_date 이하 데이터만 담겨 들어와야 한다(누설 방지는 호출측 책임).
 * - 데이터 부족이면 ok=false 로 graceful 반환.
 */
export function forecast(input: ForecastInput, cfg: ForecastConfig): ForecastResult {
  const empty: ForecastResult = {
    ok: false,
    direction: 'flat',
    confidence: 0,
    expectedChangePct: 0,
    signalPct: 0,
    forecastDate: null,
  };

  const li = compact(input.li);
  if (li.length < cfg.minSeriesLen) {
    return { ...empty, reason: `LI 시계열 부족(${li.length} < ${cfg.minSeriesLen})` };
  }
  const forecastDate = li[li.length - 1].date;
  const liValues = li.map((p) => p.value);

  // 1) 디노이즈: 끝점(현재)과 signalWindow 이전 시점의 LI 이동평균.
  const maNow = trailingMA(liValues, cfg.maWindow);
  // signalWindow 이전 기준점: 끝에서 signalWindow 만큼 떨어진 위치까지의 시계열로 MA.
  const pastIdx = liValues.length - 1 - cfg.signalWindow;
  if (pastIdx < cfg.maWindow - 1) {
    return { ...empty, forecastDate, reason: '신호창 길이만큼의 과거 데이터 부족' };
  }
  const maPast = trailingMA(liValues.slice(0, pastIdx + 1), cfg.maWindow);
  if (maNow == null || maPast == null || maNow <= 0 || maPast <= 0) {
    return { ...empty, forecastDate, reason: '이동평균 산출 불가(결측/0)' };
  }

  // 2) 신호 = 최근 signalWindow LI 로그변화.
  const signalLog = Math.log(maNow / maPast);
  const signalPct = (Math.exp(signalLog) - 1) * 100;

  // 3) 미전가분만 향후 국내변화로 추정.
  const expectedLog = cfg.elasticity * signalLog * (1 - cfg.passthroughDone);
  const expectedChangePct = (Math.exp(expectedLog) - 1) * 100;

  // 4) 데드밴드 → 방향.
  let direction: Direction = 'flat';
  if (expectedChangePct > cfg.deadbandPct) direction = 'up';
  else if (expectedChangePct < -cfg.deadbandPct) direction = 'down';

  // 5) confidence: 신호(LI 로그변화)를 과거 LI 일변동성 대비 z-score → 0~100.
  //    국내가 변동성보다 LI 변동성이 신호 크기와 같은 척도라 LI 일수익률 표준편차를 사용.
  const liDailyRet = logReturns(liValues);
  const liVol = stddev(liDailyRet);
  let confidence = 0;
  if (liVol != null && liVol > 0) {
    // signalWindow 누적 신호를 일단위 변동성으로 정규화(√window 스케일).
    const z = Math.abs(signalLog) / (liVol * Math.sqrt(cfg.signalWindow));
    confidence = Math.min(1, z / cfg.confidenceZCap) * 100;
  }

  // 데이터가 짧으면 신뢰 하향(변동성 표본 부족분 비례 감쇠).
  if (liDailyRet.length < cfg.minVolSamples) {
    confidence *= liDailyRet.length / cfg.minVolSamples;
  }
  // flat 은 신뢰 의미가 약하므로 절반으로 눌러 표시(신호가 데드밴드 미만).
  if (direction === 'flat') confidence *= 0.5;

  confidence = Math.round(Math.max(0, Math.min(100, confidence)));

  return {
    ok: true,
    direction,
    confidence,
    expectedChangePct: round4(expectedChangePct),
    signalPct: round4(signalPct),
    forecastDate,
  };
}

/**
 * 실제 방향 채점: from→to 국내가 변화율(%)을 같은 데드밴드 기준으로 up/flat/down 판정.
 * 두 값 중 하나라도 없으면 null(평가 불가).
 */
export function actualDirection(
  fromPrice: number | null,
  toPrice: number | null,
  cfg: ForecastConfig,
): { direction: Direction; changePct: number } | null {
  if (fromPrice == null || toPrice == null || fromPrice <= 0) return null;
  const changePct = (toPrice / fromPrice - 1) * 100;
  let direction: Direction = 'flat';
  if (changePct > cfg.deadbandPct) direction = 'up';
  else if (changePct < -cfg.deadbandPct) direction = 'down';
  return { direction, changePct: round4(changePct) };
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
