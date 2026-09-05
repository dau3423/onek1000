// 원천 한글 원문 → 코드 매핑.
//
// ★ i18n 필수: parking_lots 의 fee_kind / lot_kind / lot_type 은 공공데이터 원문 **한글 문자열**이다
//   (types/parking.ts 가 유니온으로 좁히지 않았다 — 원천이 값을 늘려도 적재가 깨지지 않게 한 선택).
//   그대로 렌더하면 en/ja/zh 화면에 한글이 박힌다. 표시 직전에 이 함수로 코드를 얻어 메시지 키를 찾는다.
//
// 매핑 실패 시 null 을 돌려주고, **호출부는 원문을 그대로 노출한다** — 사라지는 것보다 낫다.
// (원천이 '무료+유료' 같은 새 값을 쓰기 시작해도 화면에서 정보가 증발하지 않는다.)

export type FeeKindCode = 'free' | 'paid' | 'mixed';
export type LotKindCode = 'public' | 'private';
export type LotTypeCode = 'street' | 'offstreet' | 'annex';

/** parkingchrgeInfo — 실측(2026-09-05 전수): 무료 12,160 / 유료 5,956. '혼합'도 원천에 존재한다. */
export function toFeeKindCode(raw: string | null | undefined): FeeKindCode | null {
  switch (raw?.trim()) {
    case '무료': return 'free';
    case '유료': return 'paid';
    case '혼합': return 'mixed';
    default: return null;
  }
}

/** prkplceSe — 공영/민영 */
export function toLotKindCode(raw: string | null | undefined): LotKindCode | null {
  switch (raw?.trim()) {
    case '공영': return 'public';
    case '민영': return 'private';
    default: return null;
  }
}

/** prkplceType — 노상/노외/부설 */
export function toLotTypeCode(raw: string | null | undefined): LotTypeCode | null {
  switch (raw?.trim()) {
    case '노상': return 'street';
    case '노외': return 'offstreet';
    case '부설': return 'annex';
    default: return null;
  }
}

/**
 * 규모 3단 — 마커 크기 결정용(디자인 §2-3).
 * 라벨이 아니라 **크기**로만 쓰는 이유: 핀 위 맨숫자는 잔여면수로 오독되고,
 * 이 앱에서 마커 안 숫자는 이미 주유소 가격 순위를 뜻한다.
 */
export type ParkingSizeTier = 'sm' | 'md' | 'lg';

export function parkingSizeTier(capacity: number | null | undefined): ParkingSizeTier {
  if (capacity == null) return 'sm';   // 규모 미상은 작게 — 없는 크기를 지어내지 않는다
  if (capacity >= 200) return 'lg';
  if (capacity >= 50) return 'md';
  return 'sm';
}
