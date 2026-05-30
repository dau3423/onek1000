// 차량(연료 종류) 도메인 타입
// 로그인 사용자가 차량을 등록하면 기본 차량의 유종을 앱 기본 유종으로 자동 선택한다.
import type { ProductCode } from './station';

/** 차량 1대 (클라이언트 노출용) */
export interface Vehicle {
  id: string;
  name: string;
  fuel: ProductCode;
  isDefault: boolean;
  createdAt: string;
}

/** 차량 등록 요청 바디 */
export interface VehicleInput {
  name: string;
  fuel?: ProductCode;
  isDefault?: boolean;
}

/** 사용자당 최대 등록 대수 */
export const VEHICLE_MAX = 5;
