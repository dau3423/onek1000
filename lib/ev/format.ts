// 전기차 충전소 UI 표시용 포맷 헬퍼.

/**
 * ISO 시각 → 로케일별 상대시간("N분 전"/"N minutes ago"/"N分前"/…) 표기.
 * Intl.RelativeTimeFormat이 복수형·어순·단위 표기를 로케일별로 알아서 처리한다.
 * null/파싱 실패면 빈 문자열 — 호출부가 '갱신 정보 없음'·'방금 갱신'·'방금 전' 같은
 * 고정 문구를 ev 카탈로그에서 가져와 대체한다(이 파일은 컴포넌트가 아니라 useTranslations를 못 쓴다).
 *
 * numeric: 'always' 선택 이유 — 'auto'는 1일 전을 "어제", 1개월 전을 "지난달"로 바꿔
 * 기존 문구("1일 전"/"1개월 전")와 달라진다. 'always'는 5초·60초·60분·24시간·30일 임계값에서
 * 기존 relativeFromNow/liveRelativeFromNow의 한국어 출력과 바이트 단위로 일치한다(검증: task-6-report.md).
 *
 * 알려진 차이(실화면 영향 없음): 기존 코드는 day/30로 무한정 "N개월 전"을 냈지만(연 단위 처리 없음),
 * Intl은 12개월(=1년) 이상이면 "1년 전"으로 자연스럽게 넘어간다. syncedAt/statUpdAt은 실시간
 * 동기화 값이라 실제로 몇 달~몇 년씩 벌어지는 일이 없어 이 차이는 화면에 나타나지 않는다.
 */
export function relativeFromNow(iso: string | null, locale: string): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const diffSec = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60], ['minute', 60], ['hour', 24], ['day', 30], ['month', 12], ['year', Infinity],
  ];
  let v = diffSec;
  for (const [unit, span] of units) {
    if (Math.abs(v) < span) return rtf.format(v, unit);
    v = Math.round(v / span);
  }
  return rtf.format(v, 'year');
}
