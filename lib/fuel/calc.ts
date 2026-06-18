// 주유/충전 기록 단가 기반 자동계산 유틸.
// 단가(원/L 또는 원/kWh)가 있으면 리터(또는 kWh)↔금액을 서로 파생한다.
// 반올림 정책: 금액=정수(원), 수량=소수 2자리. PATCH 검증(금액 정수, L/kWh 소수2자리)과 정합.

/** 단가가 자동계산에 쓸 수 있는 유효한 값인지(양수). null/0/음수/NaN이면 false. */
export function hasUsableUnitPrice(unitPrice: number | null | undefined): unitPrice is number {
  return typeof unitPrice === 'number' && Number.isFinite(unitPrice) && unitPrice > 0;
}

/** 수량(L/kWh) × 단가 → 금액(원, 정수 반올림). 단가 무효면 null. */
export function quantityToAmount(quantity: number, unitPrice: number | null | undefined): number | null {
  if (!hasUsableUnitPrice(unitPrice)) return null;
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  return Math.round(quantity * unitPrice);
}

/** 금액(원) ÷ 단가 → 수량(L/kWh, 소수 2자리 반올림). 단가 무효면 null. */
export function amountToQuantity(amount: number, unitPrice: number | null | undefined): number | null {
  if (!hasUsableUnitPrice(unitPrice)) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round((amount / unitPrice) * 100) / 100;
}

/**
 * 구간 연비(km/L) — 직전 주행거리계 → 이번 주행거리계 사이를 이번 주유분으로 나눈 "탱크-투-탱크" 근사.
 * 구간 연비 = (이번 odometer − 직전 odometer) / 이번 주유량(L), 한 자리 소수 반올림.
 * 비정상 구간(거리<=0, 주유량<=0, 1~100 km/L 범위 밖)은 null(표시·집계에서 제외).
 * buildEconomy(report.ts)·저장 직후 연비·목록 구간 연비가 모두 이 규칙을 공유한다.
 */
export function segmentKmPerL(
  prevOdometer: number | null | undefined,
  curOdometer: number | null | undefined,
  liters: number | null | undefined,
): number | null {
  if (prevOdometer == null || curOdometer == null || liters == null) return null;
  if (!Number.isFinite(prevOdometer) || !Number.isFinite(curOdometer) || !Number.isFinite(liters)) {
    return null;
  }
  const dist = curOdometer - prevOdometer;
  if (dist <= 0 || liters <= 0) return null; // 입력 누락/역주행/거리 0 구간 제외
  const kmPerL = dist / liters;
  if (kmPerL > 100 || kmPerL < 1) return null; // 비현실적 값 방어(오타 등)
  return Math.round(kmPerL * 10) / 10;
}
