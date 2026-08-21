// 자동차 정비소 도메인 타입 (공공데이터포털 전국자동차정비업체표준데이터 기반)
// 세차장(types/carwash.ts)·EV(types/ev.ts)와 병행 구조. 지도 토글 레이어로 노출한다.

/**
 * 정비업체 유형(정규화).
 *  general   = 자동차종합정비업(1급)   — 전 차종 전 항목
 *  small     = 소형자동차정비업(2급)   — 소형차 중심
 *  specialty = 자동차전문정비업(3급)   — 이른바 '카센터'. 실데이터의 약 79%
 *  engine    = 원동기전문정비업
 *  unknown   = 코드 미상/기타
 *
 * ⚠️ 원천 코드에 zero-padding 이 섞여 있다(지자체마다 '1' 과 '01' 을 혼용).
 *    정규화 시 반드시 앞 0을 제거하고 비교한다 — 안 하면 조용히 unknown 으로 떨어진다.
 */
export type RepairShopType = 'general' | 'small' | 'specialty' | 'engine' | 'unknown';

/** 유형 필터 값. 'all'=전체(기본). */
export type RepairTypeFilter = 'all' | RepairShopType;

/**
 * 유형 → 핀 색.
 * 기존 레이어와 겹치지 않게 골랐다 — EV 초록, 세차장 blue/violet/cyan, 주유소 tier(적/황/녹).
 * 정비소는 amber~orange 계열을 피하고(주유소 tier 와 혼동) 따뜻한 갈색·적갈 계열로 잡는다.
 */
export const REPAIR_TYPE_COLOR: Record<RepairShopType, string> = {
  general: '#B45309',
  small: '#C2410C',
  specialty: '#92400E',
  engine: '#78350F',
  unknown: '#9CA3AF',
};

/** 지도 마커 1개 = 정비소(shop_key) 단위. rpc_repair_by_bbox 반환에 대응. */
export interface RepairMarker {
  shopKey: string;
  name: string;
  shopType: RepairShopType;
  roadAddr: string | null;
  jibunAddr: string | null;
  /** 전화번호 — 원천 채움률이 약 51% 라 절반은 null 이다. UI 는 없는 경우를 기본으로 다룬다. */
  tel?: string | null;
  /** 운영 시작/종료 시각 — 채움률 약 38%. */
  openTime?: string | null;
  closeTime?: string | null;
  lat: number;
  lng: number;
  /** 데이터기준일자(YYYY-MM-DD, 있을 때만) — 노후 행 참고용. */
  dataBaseDate?: string | null;
  /** 우리 DB sync 시각(ISO). */
  syncedAt?: string | null;
}

export interface RepairBboxResponse {
  shops: RepairMarker[];
  bbox: { sw: [number, number]; ne: [number, number] };
  cachedAt: string;
  ttlSec: number;
}

/** 정비소 상세(단건) — 마커 필드 + 관리기관/면적(상세에서만 노출). */
export interface RepairDetail extends RepairMarker {
  institution?: string | null;
  area?: string | null;
}
