'use client';

// 주유 타이밍 예측 — 선행지표 근거("왜 이렇게 예측하나요?").
// market_daily(전국 단일) 최근 N일 변화율%를 토글로 펼쳐 MOPS/환율/두바이 근거를 보여준다.
//  - 각 지표 부호/크기로 한 줄 문구. null 지표는 줄 생략.
//  - 상단 한 줄 요약은 유효 지표의 양수/음수 개수로 상승·하락·혼조 판단.

import { useState } from 'react';
import type { ForecastDriversData } from './ForecastCard';

// 부호 표기 % (소수 1자리). 예: 2.4 → "+2.4%".
function fmtPct(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

export default function ForecastDrivers({
  drivers,
  direction,
}: {
  drivers: ForecastDriversData | null;
  direction: 'up' | 'flat' | 'down';
}) {
  const [open, setOpen] = useState(false);
  if (!drivers) return null;

  const { mopsChangePct, usdkrwChangePct, dubaiChangePct, windowDays } = drivers;

  // 유효 지표의 부호 집계로 상승/하락/혼조 요약.
  const vals = [mopsChangePct, usdkrwChangePct, dubaiChangePct].filter(
    (v): v is number => v != null,
  );
  const pos = vals.filter((v) => v > 0).length;
  const neg = vals.filter((v) => v < 0).length;
  let summary: string;
  if (pos > neg) summary = '원유·국제제품가·환율이 올라 상승 압력';
  else if (neg > pos) summary = '원유·국제제품가·환율이 내려 하락 압력';
  // 동수/혼조: 예측 방향이 보합이면 그 맥락을, 아니면 단순 혼조로 표기.
  else summary = direction === 'flat' ? '선행지표가 혼조 — 큰 변동은 적을 전망' : '선행지표가 혼조';

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium text-primary hover:underline"
        aria-expanded={open}
      >
        왜 이렇게 예측하나요?
      </button>
      {open ? (
        <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {summary} (최근 {windowDays}일 기준)
          </p>
          {mopsChangePct != null ? (
            <p>국제 제품가(MOPS) 최근 {windowDays}일 {fmtPct(mopsChangePct)}</p>
          ) : null}
          {usdkrwChangePct != null ? (
            <p>
              원/달러 환율 {fmtPct(usdkrwChangePct)}{' '}
              <span className="text-gray-400">
                {usdkrwChangePct > 0
                  ? '(원화 약세→수입가 상승)'
                  : usdkrwChangePct < 0
                    ? '(원화 강세→수입가 하락)'
                    : ''}
              </span>
            </p>
          ) : null}
          {dubaiChangePct != null ? <p>두바이 원유 {fmtPct(dubaiChangePct)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
