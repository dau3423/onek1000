'use client';

// 주유 타이밍 예측 — 절감 시뮬레이션.
// band(단순 투영) 폭을 50L 기준 금액으로 환산해 "오늘 채우면/며칠 미루면 약 OO원" 감을 준다.
//  - 1회 주유량은 50L 고정. 사용자 평균 주유량 연동은 별도 API/조회 비용이 과해 2단계에선 생략(상수).
//  - band 는 모델 재구현이 아닌 단순 투영이라 어디까지나 참고용(면책 문구 1줄).

import { useTranslations } from 'next-intl';
import type { ForecastBand } from './ForecastChart';

// 1회 주유 기준 리터(고정). 사용자 평균 주유량 연동 생략 사유는 상단 주석 참고.
const DEFAULT_LITERS = 50;

export default function ForecastSavingsSim({
  band,
  direction,
}: {
  band: ForecastBand | null;
  direction: 'up' | 'flat' | 'down';
}) {
  const t = useTranslations('forecast.savingsSim');
  if (!band) return null;

  // 방향별 금액(원). up=상단폭(회피액), down=하단폭(절약액). 0이면 평탄 → flat 류 문구.
  const upAmount = Math.round((band.high - band.center) * DEFAULT_LITERS);
  const downAmount = Math.round((band.center - band.low) * DEFAULT_LITERS);

  let line: string;
  if (direction === 'up' && upAmount > 0) {
    line = t('avoidLine', { amount: upAmount.toLocaleString() });
  } else if (direction === 'down' && downAmount > 0) {
    line = t('saveLine', { amount: downAmount.toLocaleString() });
  } else {
    line = t('flatLine');
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{line}</p>
      <p className="mt-0.5 text-[10px] text-gray-400">
        {t('footnote', { liters: DEFAULT_LITERS })}
      </p>
    </div>
  );
}
