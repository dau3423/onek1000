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
