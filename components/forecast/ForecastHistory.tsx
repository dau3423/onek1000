'use client';

// 주유 타이밍 예측 — 복기 타임라인.
// 채점 완료된 과거 예측을 "지난 예측: 상승 → 실제 +2.4%, ✅ 적중" 형태로 나열한다.
//  - 실측 변화율은 % 표기로 근사한다(원 환산하지 않음 — 유종/지역 평균가 기준 변동이라 단순 %가 정직).
//  - 보합(flat)도 그대로 표시. API가 최근 20건으로 cap 하므로 전체 리스트를 렌더한다.

import type { ForecastHistoryItem, Direction } from './ForecastCard';

const DIR_LABEL: Record<Direction, string> = {
  up: '상승',
  flat: '보합',
  down: '하락',
};

// 부호 표기 % (소수 1자리). 예: 2.4 → "+2.4%", -1 → "-1.0%".
function fmtPct(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

export default function ForecastHistory({ history }: { history: ForecastHistoryItem[] }) {
  if (!history.length) return null;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <div className="mb-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">지난 예측 복기</div>
      <ul className="space-y-1">
        {history.map((h) => (
          <li
            key={`${h.forecastDate}-${h.targetDate}`}
            className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400"
          >
            <span className="min-w-0">
              <span className="text-gray-400">{h.forecastDate.slice(5)}</span>{' '}
              {DIR_LABEL[h.direction]} → 실제 {fmtPct(h.actualChangePct)}
            </span>
            <span className={`shrink-0 ${h.hit ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400'}`}>
              {h.hit ? '✅ 적중' : '❌ 빗나감'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
