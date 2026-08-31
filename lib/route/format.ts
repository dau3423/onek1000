// 경로 요약(거리·소요시간) 표시 포맷 — 순수 함수. 카카오내비 응답의 distance(m)/duration(s)를
// 화면 문구로 바꾼다. 시간 단위 문구는 로케일마다 다르므로 여기서는 숫자만 쪼개고,
// 조립은 호출부의 i18n 메시지(map.route.durationHm / durationM)가 맡는다.

/**
 * 주행거리(m) → 표시 문구. 1km 미만은 m, 그 이상은 소수 1자리 km.
 * 딱 떨어지는 값의 꼬리 ".0"은 떼어낸다("150.0km" → "150km") — BottomSheet의 반경 표기와 같은 결.
 * @returns 표시 문구. 값이 유효하지 않으면 null(표시 생략).
 */
export function formatRouteDistance(meters: number | undefined): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) return null;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1).replace(/\.0$/, '')}km`;
}

/**
 * 예상 소요(s) → {hours, minutes}. 분 단위 반올림.
 * 반올림 결과가 0분이면(1분 미만 경로) 1분으로 올린다 — "0분"은 표시 의미가 없다.
 * @returns 시/분. 값이 유효하지 않으면 null(표시 생략).
 */
export function splitRouteDuration(
  seconds: number | undefined,
): { hours: number; minutes: number } | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.max(1, Math.round(seconds / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
