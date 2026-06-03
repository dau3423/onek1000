// 전기차 충전소 UI 표시용 포맷 헬퍼.

/** ISO 시각 → "X분 전 / X시간 전 / X일 전" 상대 표기. null이면 '갱신 정보 없음'. */
export function relativeFromNow(iso?: string | null): string {
  if (!iso) return '갱신 정보 없음';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '갱신 정보 없음';
  const diff = Date.now() - ms;
  if (diff < 0) return '방금 전';
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  const mon = Math.floor(day / 30);
  return `${mon}개월 전`;
}
