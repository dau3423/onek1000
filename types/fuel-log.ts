// 내 주유 기록 도메인 타입
// 주유소 상세에서 1클릭으로 저장하고(주유소/시각/단가/유종 자동), 금액·주유량·주행거리·메모는 나중에 편집한다.
import type { ProductCode } from './station';

/** 주유 기록 1건 (클라이언트 노출용) */
export interface FuelLog {
  id: string;
  stationId: string;
  stationName: string;
  product: ProductCode;
  /** 기록 시점 단가(원/L). 우리 DB에 가격이 없으면 null */
  unitPrice: number | null;
  /** 결제 금액(원). 나중 편집(선택) */
  amountWon: number | null;
  /** 주유량(L). 나중 편집(선택) */
  liters: number | null;
  /** 주행거리(km). 나중 편집(선택) */
  odometer: number | null;
  /** 메모. 나중 편집(선택) */
  memo: string | null;
  /** 주유 시각(ISO) */
  loggedAt: string;
  createdAt: string;
}

/** 1클릭 생성 요청 바디(최소: stationId. 단가/유종/시각은 서버가 보강) */
export interface FuelLogCreateInput {
  stationId: string;
}

/** 편집 요청 바디(모두 선택, null 허용) */
export interface FuelLogPatchInput {
  amountWon?: number | null;
  liters?: number | null;
  odometer?: number | null;
  memo?: string | null;
}

/** 기록 목록 간단 통계 */
export interface FuelLogStats {
  count: number;
  /** amount_won 합(원). 금액 입력된 기록만 합산 */
  totalSpent: number;
  /** 평균 단가(원/L). unit_price 있는 기록만 평균. 없으면 null */
  avgUnitPrice: number | null;
}
