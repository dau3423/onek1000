// 차계부 / 주유비 리포트 도메인 타입.
// 우리 DB(fuel_logs)만 집계해 만든다(외부 API 호출 없음). 모든 회원 무료.
import type { ProductCode } from './station';

/** 월별 집계 1행(YYYY-MM). 주유(gas) 중심으로 금액/주유량을 집계한다. */
export interface MonthlyFuelPoint {
  /** 'YYYY-MM' */
  month: string;
  /** 해당 월 주유비(원) 합. 금액 입력된 주유 기록만 합산 */
  spent: number;
  /** 해당 월 주유량(L) 합. 주유량 입력된 기록만 합산 */
  liters: number;
  /** 해당 월 주유 횟수(gas 기록 수) */
  count: number;
}

/** 기간 전체 요약(주유 gas 기준). */
export interface FuelReportSummary {
  /** 집계 기간(개월) */
  months: number;
  /** 총 주유비(원). 금액 입력된 주유 기록만 합산 */
  totalSpent: number;
  /** 총 주유량(L). 주유량 입력된 기록만 합산 */
  totalLiters: number;
  /** 평균 단가(원/L). 단가 있는 주유 기록의 가중평균(주유량 가중, 없으면 단순평균). 데이터 없으면 null */
  avgUnitPrice: number | null;
  /** 주유 횟수(gas 기록 수) */
  count: number;
  /** 이번 달(현재 월) 주유비(원) */
  thisMonthSpent: number;
}

/** 연비 결과(km/L). 주행거리계(odometer) 연속 기록으로 구간 연비를 산출. */
export interface FuelEconomy {
  /** 평균 연비(km/L). 산출 가능한 구간이 없으면 null */
  avgKmPerL: number | null;
  /** 연비 산출에 사용된 구간 수 */
  segments: number;
  /** 연비 산출이 불가한 사유(빈 상태 안내용). null이면 정상 */
  reason: 'no-odometer' | 'need-more' | null;
}

/**
 * 절약액(추정). 정직하게 "전국 평균 대비"로만 산출한다.
 * 시점별 시장 평균 히스토리가 DB에 없으므로 "현재 전국 평균"을 기준선으로 사용한다(보수적 근사).
 */
export interface FuelSavings {
  /** 추정 절약액(원). (전국평균 - 내단가) × 주유량 의 합(양수만 누적하지 않고 순합산). 산출 불가면 null */
  estimatedWon: number | null;
  /** 비교 기준선: 유종별 현재 전국 평균가(원/L) */
  baseline: Partial<Record<ProductCode, number>>;
  /** 절약 산출에 사용된(단가·주유량·평균가가 모두 있는) 주유 기록 수 */
  usedCount: number;
}

/** 리포트 응답 전체. */
export interface FuelReport {
  summary: FuelReportSummary;
  monthly: MonthlyFuelPoint[];
  economy: FuelEconomy;
  savings: FuelSavings;
  /** EV(충전) 기록이 있으면 참고 표시용 간단 집계(원/kWh 단위 분리) */
  ev: {
    count: number;
    totalSpent: number;
    totalKwh: number;
  };
}
