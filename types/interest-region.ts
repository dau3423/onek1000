// 관심 지역 (집/회사 등 고정 좌표) 도메인 타입
import type { ProductCode } from './station';

/** 관심 지역 1건 (클라이언트 노출용 — 통지 상태 등 내부 컬럼 제외) */
export interface InterestRegion {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  product: ProductCode;
  createdAt: string;
}

/** 관심 지역 등록 요청 바디 */
export interface InterestRegionInput {
  name: string;
  lat: number;
  lng: number;
  radiusM?: number;
  product?: ProductCode;
}

/** 사용자당 최대 등록 개수 */
export const INTEREST_REGION_MAX = 5;
/** 기본 반경(m) */
export const INTEREST_REGION_DEFAULT_RADIUS_M = 5000;
