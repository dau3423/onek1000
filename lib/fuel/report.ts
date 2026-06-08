// 차계부 리포트 순수 계산 유틸(외부 의존 없음 → 테스트/Mock 동일 동작).
// 입력: 내 주유/충전 기록 + 유종별 현재 전국 평균가(절약 추정 기준선).
// 출력: 월별 주유비/요약/연비(km/L)/절약(추정).
import type { ProductCode } from '@/types/station';
import type { FuelLog } from '@/types/fuel-log';
import type {
  FuelEconomy,
  FuelReport,
  FuelReportSummary,
  FuelSavings,
  MonthlyFuelPoint,
} from '@/types/fuel-report';

/** ISO 시각 → 'YYYY-MM'(로컬 기준). */
function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 현재 기준 최근 N개월의 'YYYY-MM' 키 배열(오래된→최신). 비어있는 달도 0으로 채우기 위함. */
export function recentMonthKeys(months: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/** 월별 주유비/주유량/횟수 집계(gas만). 기록 없는 달도 0으로 채워 차트가 끊기지 않게 한다. */
export function buildMonthly(logs: FuelLog[], months: number, now: Date = new Date()): MonthlyFuelPoint[] {
  const keys = recentMonthKeys(months, now);
  const map = new Map<string, MonthlyFuelPoint>();
  for (const k of keys) map.set(k, { month: k, spent: 0, liters: 0, count: 0 });

  for (const l of logs) {
    if (l.kind !== 'gas') continue;
    const k = monthKey(l.loggedAt);
    const p = map.get(k);
    if (!p) continue; // 기간 밖
    p.count += 1;
    if (l.amountWon != null) p.spent += l.amountWon;
    if (l.liters != null) p.liters += l.liters;
  }
  return keys.map((k) => map.get(k)!);
}

/** 기간 요약(gas 기준). 평균 단가는 주유량 가중평균(주유량 없으면 단순평균). */
export function buildSummary(logs: FuelLog[], months: number, now: Date = new Date()): FuelReportSummary {
  const gas = logs.filter((l) => l.kind === 'gas');
  const totalSpent = gas.reduce((s, l) => s + (l.amountWon ?? 0), 0);
  const totalLiters = gas.reduce((s, l) => s + (l.liters ?? 0), 0);

  // 평균 단가: 단가가 있는 기록만. 주유량이 있으면 가중평균, 없으면 단순평균으로 폴백.
  const priced = gas.filter((l) => l.unitPrice != null);
  let avgUnitPrice: number | null = null;
  if (priced.length > 0) {
    const weighted = priced.filter((l) => l.liters != null && l.liters > 0);
    if (weighted.length > 0) {
      const wSum = weighted.reduce((s, l) => s + (l.unitPrice ?? 0) * (l.liters ?? 0), 0);
      const lSum = weighted.reduce((s, l) => s + (l.liters ?? 0), 0);
      avgUnitPrice = Math.round(wSum / lSum);
    } else {
      avgUnitPrice = Math.round(priced.reduce((s, l) => s + (l.unitPrice ?? 0), 0) / priced.length);
    }
  }

  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthSpent = gas
    .filter((l) => monthKey(l.loggedAt) === thisKey)
    .reduce((s, l) => s + (l.amountWon ?? 0), 0);

  return {
    months,
    totalSpent,
    totalLiters: Math.round(totalLiters * 100) / 100,
    avgUnitPrice,
    count: gas.length,
    thisMonthSpent,
  };
}

/**
 * 연비(km/L) — 주행거리계(odometer) 연속 기록으로 구간 연비 산출.
 * 구간 연비 = (이번 odometer - 직전 odometer) / 이번 주유량(L).
 * 직전→이번 사이 주행거리를 이번 주유분으로 나누는 "탱크-투-탱크" 근사(주유량 입력 필요).
 * 비정상 구간(거리<=0, 주유량<=0, 단위시간당 비현실적 값)은 제외.
 */
export function buildEconomy(logs: FuelLog[]): FuelEconomy {
  const gas = logs
    .filter((l) => l.kind === 'gas' && l.odometer != null)
    .slice()
    .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime());

  if (gas.length === 0) return { avgKmPerL: null, segments: 0, reason: 'no-odometer' };
  if (gas.length < 2) return { avgKmPerL: null, segments: 0, reason: 'need-more' };

  let totalDist = 0;
  let totalLiters = 0;
  let segments = 0;
  for (let i = 1; i < gas.length; i++) {
    const prev = gas[i - 1];
    const cur = gas[i];
    const dist = (cur.odometer ?? 0) - (prev.odometer ?? 0);
    const liters = cur.liters ?? 0;
    if (dist <= 0 || liters <= 0) continue; // 입력 누락/역주행 구간 제외
    const kmPerL = dist / liters;
    if (kmPerL > 100 || kmPerL < 1) continue; // 비현실적 값 방어(오타 등)
    totalDist += dist;
    totalLiters += liters;
    segments += 1;
  }

  if (segments === 0) return { avgKmPerL: null, segments: 0, reason: 'need-more' };
  return { avgKmPerL: Math.round((totalDist / totalLiters) * 10) / 10, segments, reason: null };
}

/**
 * 절약액(추정) — "전국 평균 대비". 정직성을 위해 과장하지 않는다.
 * 구간별: (유종 전국평균가 - 내단가) × 주유량 을 합산(순합산: 비싸게 넣은 건 음수로 상쇄).
 * 시점별 평균 히스토리가 DB에 없어 "현재 전국 평균"을 기준선으로 쓰는 보수적 근사임을 라벨에 명시한다.
 */
export function buildSavings(
  logs: FuelLog[],
  baseline: Partial<Record<ProductCode, number>>,
): FuelSavings {
  const gas = logs.filter(
    (l) => l.kind === 'gas' && l.unitPrice != null && l.liters != null && l.liters > 0,
  );
  let sum = 0;
  let usedCount = 0;
  for (const l of gas) {
    const avg = baseline[l.product];
    if (avg == null) continue;
    sum += (avg - (l.unitPrice ?? 0)) * (l.liters ?? 0);
    usedCount += 1;
  }
  return {
    estimatedWon: usedCount > 0 ? Math.round(sum) : null,
    baseline,
    usedCount,
  };
}

/** EV(충전) 참고 집계(원/kWh 단위 분리). */
function buildEv(logs: FuelLog[]): FuelReport['ev'] {
  const ev = logs.filter((l) => l.kind === 'ev');
  return {
    count: ev.length,
    totalSpent: ev.reduce((s, l) => s + (l.amountWon ?? 0), 0),
    totalKwh: Math.round(ev.reduce((s, l) => s + (l.kwh ?? 0), 0) * 100) / 100,
  };
}

/** 리포트 전체 조립. */
export function buildReport(
  logs: FuelLog[],
  baseline: Partial<Record<ProductCode, number>>,
  months: number,
  now: Date = new Date(),
): FuelReport {
  return {
    summary: buildSummary(logs, months, now),
    monthly: buildMonthly(logs, months, now),
    economy: buildEconomy(logs),
    savings: buildSavings(logs, baseline),
    ev: buildEv(logs),
  };
}
