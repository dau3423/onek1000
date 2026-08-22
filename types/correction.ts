// 사용자 제보(정정 요청) 타입 — 정비소 브랜드 / 주유소 유가.
//
// 두 제보가 한 테이블(place_corrections)을 공유한다. 화면·검수 흐름이 같아서다.
// DB 정의와 그 근거는 supabase/migrations/0049_place_corrections.sql 참고.

import type { RepairBrand } from '@/types/repair';
import type { ProductCode } from '@/types/station';

export type CorrectionKind = 'repair_brand' | 'fuel_price';
export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

/** 제보 대상 종류. reviews 의 PlaceType 중 제보를 받는 둘만. */
export type CorrectionTargetType = 'gas' | 'repair';

/** 정비소 브랜드 제보 payload. brand=null 은 '브랜드 없음(동네 정비소)'으로 정정. */
export interface RepairBrandPayload {
  brand: RepairBrand | null;
}

/** 유가 제보 payload. */
export interface FuelPricePayload {
  product: ProductCode;
  /** 현장에서 본 실제 가격(원). */
  price: number;
}

export type CorrectionPayload = RepairBrandPayload | FuelPricePayload;

/**
 * 유가 제보 표시용 — 승인됐고 오피넷 기준일보다 최신인 것만(fuel_price_report_active 뷰).
 * 오피넷이 더 새 가격을 받으면 서버 뷰에서 자동으로 빠지므로 클라이언트는 신선도를 따질 필요가 없다.
 */
export interface ActiveFuelReport {
  product: ProductCode;
  reportedPrice: number;
  /** 제보 시각(ISO). 화면에 '제보 날짜'로 표기한다. */
  reportedAt: string;
  officialPrice: number;
  officialTradeDt: string;
}

/** 첨부 사진 — 리뷰와 같은 규약(버킷 'review-photos', 서명 URL). 제보에서는 선택 항목이다. */
export const CORRECTION_PHOTO_MAX = 3;

/**
 * 유가 제보 입력 범위 — 오타·장난 입력을 막는다.
 * 국내 실거래가는 등유 1,000원대~고급휘발유 2,000원대라 이 범위면 정상 입력을 자르지 않는다.
 */
export const FUEL_PRICE_MIN = 500;
export const FUEL_PRICE_MAX = 5000;

export function isValidFuelPrice(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= FUEL_PRICE_MIN && v <= FUEL_PRICE_MAX;
}
