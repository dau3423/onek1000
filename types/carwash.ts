// 독립 세차장 도메인 타입 (행정안전부 전국세차장표준데이터 기반)
// 주유소(types/station.ts)·EV(types/ev.ts)와 병행 구조. 지도 토글 레이어로 노출한다.

/** 세차유형(정규화) — self=셀프 / hand=손세차·디테일 / auto=자동·기계식 / unknown=미확인. */
export type WashType = 'self' | 'hand' | 'auto' | 'unknown';

/** 유형 필터 값. 'all'=미확인 포함 전체(FR-3 기본값). */
export type CarwashTypeFilter = 'all' | 'self' | 'hand' | 'auto';

/** 유형 → 사람이 읽는 라벨(팝업/범례 뱃지). unknown은 "유형 미확인"으로 정직 표기(AC-2.5). */
export const WASH_TYPE_LABEL: Record<WashType, string> = {
  self: '셀프세차',
  hand: '손세차·디테일',
  auto: '자동세차',
  unknown: '유형 미확인',
};

/** 유형 → 핀/뱃지 색(design §2-3 팔레트). EV 초록·주유소 tier 색과 겹치지 않게 blue/violet/cyan/gray. */
export const WASH_TYPE_COLOR: Record<WashType, string> = {
  self: '#2563EB',
  hand: '#7C3AED',
  auto: '#0891B2',
  unknown: '#9CA3AF',
};

/** 지도 마커 1개 = 세차장(mgmt_no) 단위. rpc_carwash_by_bbox 반환에 대응. */
export interface CarwashMarker {
  mgmtNo: string;
  name: string;
  washType: WashType;
  roadAddr: string | null;
  jibunAddr: string | null;
  /** 세차장 전화번호(있을 때만). */
  tel?: string | null;
  /** 평일 운영 시작/종료 시각(있을 때만). */
  weekdayOpen?: string | null;
  weekdayClose?: string | null;
  /** 세차요금정보(있을 때만). */
  feeInfo?: string | null;
  /** 휴무일(있을 때만). */
  closedDay?: string | null;
  lat: number;
  lng: number;
  /** 데이터기준일자(YYYY-MM-DD, 있을 때만) — 노후 행 참고용. */
  dataBaseDate?: string | null;
  /** 우리 DB sync 시각(ISO). */
  syncedAt?: string | null;
}

export interface CarwashBboxResponse {
  places: CarwashMarker[];
  bbox: { sw: [number, number]; ne: [number, number] };
  cachedAt: string;
  ttlSec: number;
}

/**
 * 세차장 상세(단건) — 마커 필드 + 휴일 운영시간(상세에서만 노출).
 * 상세 페이지(/carwash/[id])에서 mgmt_no로 단건 조회한 결과에 대응.
 * 대표자명 등 개인정보는 스키마에 없으므로 여기에도 존재하지 않는다(0038 주석 참조).
 */
export interface CarwashDetail extends CarwashMarker {
  /** 휴일 운영 시작/종료 시각(있을 때만). */
  holidayOpen?: string | null;
  holidayClose?: string | null;
}
