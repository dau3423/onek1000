// 주유 타이밍 예측 v1 — 모델 상수(설정).
//
// 실데이터 10.4년(2016~2026) 검증으로 확정한 파라미터를 한곳에 모은다. 모델/상수를 바꾸면
// MODEL_VERSION 도 함께 올려 과거 예측과 병행 비교가 가능하게 한다(price_forecast.model_version).
//
// 근거 요약:
//  - 국내 소매가는 원화환산 싱가포르 제품가에 약 2주(14일) 후행(시차상관 피크 lag≈14d, +0.36).
//  - 분포시차 전가: 50%@~16일, 90%@~31일. 총 전가 탄력성 Σβ≈0.22(국제 로그변화→국내 로그변화).
//  - 2023~ 최근은 전가가 빨라짐 → 신호창/horizon을 과도하게 길게 잡지 않는다(과적합 금지).

export interface ForecastConfig {
  /** 선행지표(LI) 디노이즈 이동평균 창(일). 5~7일. */
  maWindow: number;
  /** 신호로 쓰는 LI 로그변화 측정 창(일). 최근 14일. */
  signalWindow: number;
  /** 예측이 바라보는 미래 기간(일). target_date = forecast_date + horizon. */
  horizon: number;
  /** 국제→국내 총 전가 탄력성(Σβ). */
  elasticity: number;
  /**
   * 신호창(signalWindow) 시점부터 forecast_date 까지 이미 국내가에 전가된 비율(0~1).
   * 전가곡선(50%@16d/90%@31d)을 단순 적용한 값. "미전가분" = (1 - 이 값).
   * signalWindow=14d 면 대략 절반 못 미치게 전가됐다고 보고 0.4 사용.
   */
  passthroughDone: number;
  /** 방향 판정 데드밴드(%). |예상변화%| 가 이 값 이하면 flat. */
  deadbandPct: number;
  /** confidence z→% 매핑 시 100%에 해당하는 z 절대값(이 이상은 100% 캡). */
  confidenceZCap: number;
  /** confidence 계산용 과거 일변동성 표본 최소 길이(일). 미만이면 신뢰 하향. */
  minVolSamples: number;
  /** 예측 자체가 가능한 최소 시계열 길이(일). 미만이면 예측 생략. */
  minSeriesLen: number;
  /** 모델/파라미터 식별자. price_forecast.model_version 에 기록. */
  version: string;
}

export const FORECAST_CONFIG: ForecastConfig = {
  maWindow: 7,
  signalWindow: 14,
  horizon: 14,
  elasticity: 0.22,
  passthroughDone: 0.4,
  deadbandPct: 0.2,
  confidenceZCap: 2.5,
  minVolSamples: 20,
  minSeriesLen: 30,
  version: 'v1-li14',
};

/** 유종 코드 ↔ market_daily MOPS 컬럼 매핑. */
export const FUEL_TO_MOPS: Record<string, 'mops_gasoline' | 'mops_diesel'> = {
  B027: 'mops_gasoline', // 보통휘발유 ↔ 싱가포르 휘발유 92RON
  D047: 'mops_diesel', // 자동차경유 ↔ 싱가포르 경유
};

/** 예측 대상 유종(2단계 범위). */
export const FORECAST_FUELS = ['B027', 'D047'] as const;
