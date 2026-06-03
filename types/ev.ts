// 전기차 충전소 도메인 타입 (data.go.kr EvCharger 기반)
// 주유소(types/station.ts)와 병행 구조. 지도 토글 레이어로 노출한다.

/** 충전기 타입 코드 (data.go.kr chgerType). 미지정 코드는 '기타'로 처리. */
export type ChargerTypeCode =
  | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10';

/** 충전기 타입 코드 → 사람이 읽는 라벨 */
export const CHARGER_TYPE_LABEL: Record<string, string> = {
  '01': 'DC차데모',
  '02': 'AC완속',
  '03': 'DC차데모+AC3상',
  '04': 'DC콤보',
  '05': 'DC차데모+DC콤보',
  '06': 'DC차데모+AC3상+DC콤보',
  '07': 'AC3상',
  '08': 'DC콤보(완속)',
  '09': 'DC차데모+DC콤보',
  '10': 'DC콤보+NACS',
};

/** 충전기 타입 코드 라벨(미지정 코드는 '기타(코드)'). */
export function chargerTypeLabel(code?: string | null): string {
  const c = String(code ?? '').trim();
  return CHARGER_TYPE_LABEL[c] ?? (c ? `기타(${c})` : '기타');
}

/**
 * 급속/완속 구분.
 * - AC완속(02)/AC3상(07)/DC콤보(완속)(08)은 완속으로, 그 외 DC 계열은 급속으로 본다.
 * - output(kW)이 있으면 50kW 이상을 급속으로 보정한다(코드 누락 대비).
 */
export type ChargerSpeed = 'fast' | 'slow';

const SLOW_TYPE_CODES = new Set(['02', '07', '08']);

export function chargerSpeed(code?: string | null, outputKw?: number | null): ChargerSpeed {
  const c = String(code ?? '').trim();
  if (typeof outputKw === 'number' && Number.isFinite(outputKw) && outputKw > 0) {
    return outputKw >= 50 ? 'fast' : 'slow';
  }
  if (SLOW_TYPE_CODES.has(c)) return 'slow';
  if (c) return 'fast';
  return 'slow';
}

/** 충전기 상태 코드 (data.go.kr stat). */
export type ChargerStatCode = '0' | '1' | '2' | '3' | '4' | '5';

export const CHARGER_STAT_LABEL: Record<string, string> = {
  '0': '알수없음',
  '1': '통신이상',
  '2': '사용가능',
  '3': '충전중',
  '4': '운영중지',
  '5': '점검중',
};

export function chargerStatLabel(code?: string | null): string {
  const c = String(code ?? '').trim();
  return CHARGER_STAT_LABEL[c] ?? '알수없음';
}

/** 상태 코드 색 톤(배지). 사용가능=초록, 충전중=노랑, 그 외=회색. */
export function chargerStatTone(code?: string | null): 'available' | 'busy' | 'off' {
  const c = String(code ?? '').trim();
  if (c === '2') return 'available';
  if (c === '3') return 'busy';
  return 'off';
}

/** 충전기 단위 1행 (ev_chargers 테이블 1행에 대응). */
export interface EvChargerUnit {
  /** 충전소 ID(8자리) */
  statId: string;
  /** 충전기 ID(2자리) */
  chgerId: string;
  chgerType: string;
  /** 충전용량(kW). 없으면 null */
  output: number | null;
  /** 상태 코드 */
  stat: string;
  /** 상태 갱신 시각(ISO). 없으면 null */
  statUpdAt: string | null;
}

/** 지도 마커 1개 = 충전소(statId) 단위. 충전기 상태를 집계해 담는다. */
export interface EvStationMarker {
  statId: string;
  name: string;
  lat: number;
  lng: number;
  /** 운영기관명 */
  busiNm: string | null;
  /** 충전기 총 대수 */
  totalChargers: number;
  /** 사용가능(stat=2) 대수 */
  availableChargers: number;
  /** 급속 보유 여부 */
  hasFast: boolean;
  /** 완속 보유 여부 */
  hasSlow: boolean;
  /** 최대 충전용량(kW). 없으면 null */
  maxOutput: number | null;
  /** 충전소 내 충전기 중 가장 최근 상태 갱신 시각(ISO). "최근 갱신 X 전" 표시용 */
  latestStatUpdAt: string | null;
  /** 우리 DB sync 시각(ISO) */
  syncedAt: string | null;
}

/** 충전소 상세(마커 + 충전기 목록 + 정적 정보). */
export interface EvStationDetail extends EvStationMarker {
  address: string | null;
  busiCall: string | null;
  useTime: string | null;
  parkingFree: boolean | null;
  chargers: EvChargerUnit[];
}

export interface EvBboxResponse {
  stations: EvStationMarker[];
  bbox: { sw: [number, number]; ne: [number, number] };
  cachedAt: string;
  ttlSec: number;
}
