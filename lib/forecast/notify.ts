// 주유 타이밍(가격 인상) 예측 알림 — 발송 판정 + dedupe 순수함수.
//
// DB/네트워크 의존 없이 "보낼지 말지"만 결정한다(단위 검증 용이). 실제 조회/발송은
// app/api/internal/forecast-notify/route.ts 가 담당하고, 판정은 여기 함수에 위임한다.
//
// 설계 원칙(오발송 방지, 보수적):
//   - 상승(up) 이고 신뢰도가 임계치 이상일 때만 발송한다(flat/down 제외, 저신뢰 스팸 차단).
//   - 같은 상승 국면에서 매일 반복 발송 금지(dedupe):
//       · 직전 발송 이후 MIN_RESEND_DAYS 이내면 보내지 않는다(쿨다운).
//       · 단, 직전 발송보다 "더 새로운(다른) forecast_date 의 상승 국면으로 갱신"됐고
//         쿨다운도 지났으면 다시 보낸다(새 국면 1회).
//     → 결과적으로 "한 상승 국면당 사용자 1회" 에 수렴한다.

import type { Direction } from './model';

/** 발송 임계치 — 신뢰도(%)가 이 값 미만이면 발송하지 않는다(저신뢰 스팸 방지). */
export const FORECAST_NOTIFY_MIN_CONFIDENCE = 30;

/**
 * 직전 발송 이후 같은 사용자에게 다시 보내기까지의 최소 간격(일).
 * 같은 상승 국면(매일 비슷한 up 예측)에서 반복 발송을 막는 쿨다운.
 * horizon(14일) 한 사이클에 사실상 1회만 보내도록 horizon 과 같게 둔다.
 */
export const FORECAST_NOTIFY_MIN_RESEND_DAYS = 14;

/** 발송 후보(오늘자 최신 예측). */
export interface ForecastSnapshot {
  fuelType: string;
  forecastDate: string; // YYYY-MM-DD
  direction: Direction;
  confidence: number; // 0~100
}

/** 같은 사용자의 직전 발송 이력(없으면 null). */
export interface LastSent {
  forecastDate: string; // YYYY-MM-DD
  sentAt: string; // ISO timestamp
}

export interface NotifyDecisionOptions {
  minConfidence?: number;
  minResendDays?: number;
  /** 판정 기준 '지금' 시각(ISO). 테스트 주입용. 미지정 시 Date.now(). */
  now?: string;
}

export type NotifySkipReason =
  | 'not-up' // 방향이 상승이 아님
  | 'low-confidence' // 신뢰도 임계치 미만
  | 'cooldown'; // 쿨다운 내 + 새 국면 아님(중복)

export type NotifyDecision =
  | { send: true }
  | { send: false; reason: NotifySkipReason };

/** ISO/날짜 두 시점 사이 경과 일수(절대값, 소수 포함). */
function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  return Math.abs(a - b) / 86400000;
}

/**
 * 오늘자 예측 + 직전 발송 이력으로 "이 사용자에게 지금 보낼지" 판정.
 * 순수함수: 외부 의존 없음.
 */
export function decideForecastNotify(
  forecast: ForecastSnapshot,
  last: LastSent | null,
  opts: NotifyDecisionOptions = {},
): NotifyDecision {
  const minConfidence = opts.minConfidence ?? FORECAST_NOTIFY_MIN_CONFIDENCE;
  const minResendDays = opts.minResendDays ?? FORECAST_NOTIFY_MIN_RESEND_DAYS;
  const nowIso = opts.now ?? new Date().toISOString();

  // 1) 상승 국면만 — flat/down 은 발송하지 않는다.
  if (forecast.direction !== 'up') return { send: false, reason: 'not-up' };

  // 2) 저신뢰 스팸 방지.
  if (forecast.confidence < minConfidence) return { send: false, reason: 'low-confidence' };

  // 3) 첫 발송이면 보낸다.
  if (!last) return { send: true };

  // 4) dedupe: 직전 발송이 쿨다운 이내면 같은 국면으로 보고 보내지 않는다.
  //    (forecast_date 가 그새 며칠 흘러도, 쿨다운 안이면 같은 상승 추세로 간주.)
  if (daysBetween(nowIso, last.sentAt) < minResendDays) {
    return { send: false, reason: 'cooldown' };
  }

  // 5) 쿨다운을 넘겼고(=새 국면 가능성) 예측 기준일도 직전 발송 근거보다 이후면 새 국면 1회 발송.
  //    forecast_date 가 직전과 같다면(데이터 정체) 굳이 다시 보내지 않는다.
  if (forecast.forecastDate <= last.forecastDate) {
    return { send: false, reason: 'cooldown' };
  }

  return { send: true };
}

/** 상승 전망 푸시 카피 — horizon/신뢰도에 맞게, 단정·익일 표현 없이. */
export function buildForecastNotifyPayload(
  fuelLabel: string,
  horizonDays: number,
): { title: string; body: string; url: string; tag: string } {
  // ⚠️ 모델은 horizon 일 방향성이라 "내일부터 인상" 류 익일/단정 표현 금지.
  //    임계치 통과분(고신뢰)만 발송하므로 "상승 전망" 정도의 확신 톤은 허용.
  return {
    title: '⛽ 기름값 상승 전망',
    body: `향후 ${horizonDays}일 ${fuelLabel} 가격 상승 전망 — 지금 채우는 게 유리해요`,
    url: '/?forecast=1',
    tag: 'forecast-up',
  };
}
