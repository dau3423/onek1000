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


/**
 * 정비소 브랜드(체인·공식 서비스망). 원천에 브랜드 필드가 없어 업체명에서 추론한다
 * (lib/repair/brand.ts). null = 브랜드 없는 동네 카센터 — 전체의 약 94%로 이게 다수다.
 */
export type RepairBrand =
  | 'autoq'      // 기아 오토큐
  | 'bluehands'  // 현대 블루핸즈
  | 'speedmate'  // SK 스피드메이트
  | 'renault'    // 르노코리아
  | 'autooasis'  // 현대오일뱅크 오토오아시스
  | 'kgm'        // 쌍용 · KG모빌리티
  | 'chevrolet'  // 쉐보레 · GM
  | 'carpos'     // 카포스
  | 'gongim'     // 공임나라
  | 'tire'       // 타이어 전문(체인 + 동네 타이어점)
  | 'inspection' // 자동차검사(지정정비사업자)
  | 'imported';  // 수입차(개별 건수가 적어 묶음)


/**
 * 브랜드별 마커 색. 같은 레이어 안에서 서로 구별되는 것이 목적이라
 * 각 사의 상징색을 쓰되, 인접 색끼리 붙지 않게 골랐다.
 * null(무소속)은 아래 REPAIR_TYPE_COLOR 를 그대로 쓴다 — 94%가 여기라 기존 갈색 톤을 유지해야
 * "브랜드 있는 곳"이 도드라진다.
 */
export const REPAIR_BRAND_COLOR: Record<RepairBrand, string> = {
  autoq: '#C21B2E',      // 기아 진홍
  bluehands: '#002C5F',  // 현대 네이비
  speedmate: '#F26522',  // SK 주황
  renault: '#EFA900',    // 르노 골드옐로우
  autooasis: '#00A0E9',  // 현대오일뱅크 하늘
  kgm: '#0F5C4B',        // 진초록
  chevrolet: '#5B6770',  // 그레이블루
  carpos: '#7C3AED',     // 보라
  gongim: '#0891B2',     // 청록
  tire: '#374151',       // 타이어 먹색
  inspection: '#15803D',  // 검사 초록(합격 도장 연상)
  imported: '#111827',   // 검정
};


/**
 * 다크 테마용 브랜드 색. 라이트 색을 그대로 쓰면 어두운 배경에서 안 보인다 —
 * 실측 결과 12개 중 8개가 대비 3:1 미만이었다(타이어 1.42:1, 수입차 1.21:1).
 * 색상(hue)은 유지하고 명도만 올려 같은 브랜드로 읽히게 했고, 다크 배경(#1F2937) 기준
 * **전 색상 4.5:1 이상**을 확인했다.
 * 지도 마커는 라이트 지도 위에 그려지므로 여기 값을 쓰지 않는다 — 목록·뱃지 전용이다.
 */
export const REPAIR_BRAND_COLOR_DARK: Record<RepairBrand, string> = {
  autoq: '#E36A78',
  bluehands: '#3B91F5',
  speedmate: '#E8692C',
  renault: '#E3A40C',
  autooasis: '#0C9CDD',
  kgm: '#23A487',
  chevrolet: '#87929B',
  carpos: '#A378EC',
  gongim: '#129BBC',
  tire: '#8391A8',
  inspection: '#23A554',
  imported: '#788FBF',
};

/**
 * 알려진 브랜드 코드 목록 — REPAIR_BRAND_COLOR 의 키에서 파생한다.
 * 별도 배열로 손으로 적으면 브랜드를 추가할 때 한쪽만 고치는 사고가 난다.
 */
export const REPAIR_BRANDS = Object.keys(REPAIR_BRAND_COLOR) as RepairBrand[];

/** 외부 입력(제보 payload 등)이 알려진 브랜드인지 검증한다. */
export function isRepairBrand(v: unknown): v is RepairBrand {
  return typeof v === 'string' && (REPAIR_BRANDS as string[]).includes(v);
}

/** 브랜드 필터 값. 'all'=전체(기본), 'none'=브랜드 없는 무소속만. */
export type RepairBrandFilter = 'all' | 'none' | RepairBrand;

/**
 * 드롭다운 표시 순서. 오토큐·블루핸즈를 맨 앞에 두고 굵게 강조한다 —
 * 실사용 빈도가 가장 높은 두 곳이라 목록을 훑지 않고 바로 집을 수 있어야 한다.
 */
export const REPAIR_BRAND_ORDER: { value: RepairBrandFilter; emphasis?: boolean }[] = [
  { value: 'all' },
  { value: 'autoq', emphasis: true },
  { value: 'bluehands', emphasis: true },
  { value: 'speedmate' },
  { value: 'renault' },
  { value: 'autooasis' },
  { value: 'kgm' },
  { value: 'chevrolet' },
  { value: 'carpos' },
  { value: 'gongim' },
  { value: 'tire' },
  { value: 'inspection' },
  { value: 'imported' },
  { value: 'none' },
];

/** 지도 마커 1개 = 정비소(shop_key) 단위. rpc_repair_by_bbox 반환에 대응. */
export interface RepairMarker {
  shopKey: string;
  name: string;
  shopType: RepairShopType;
  /** 체인·공식 서비스망. null = 무소속(다수). */
  brand?: RepairBrand | null;
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
