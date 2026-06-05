// 1000냥 주유소 - 공통 타입 정의

export type ProductCode = 'B027' | 'B034' | 'D047' | 'K015' | 'C004';

export const PRODUCT_LABEL: Record<ProductCode, string> = {
  B027: '휘발유',
  B034: '고급휘발유',
  D047: '경유',
  K015: '실내등유',
  C004: 'LPG',
};

// EXP = 한국도로공사 고속도로(휴게소) 주유소. Opinet UNI_ID 체계와 별개로 'EX-' prefix id로 적재된다.
// (정유사 oilCompany 값은 별도로 매핑하지 않고, 고속도로 구분은 brand=EXP + is_highway 플래그로 표현한다.)
export type BrandCode = 'SKE' | 'GSC' | 'HDO' | 'SOL' | 'RTE' | 'ETC' | 'RTO' | 'NHO' | 'E1G' | 'SOG' | 'EXP';

export const BRAND_LABEL: Record<BrandCode, string> = {
  SKE: 'SK에너지',
  GSC: 'GS칼텍스',
  HDO: '현대오일뱅크',
  SOL: 'S-OIL',
  RTE: '알뜰주유소',
  RTO: '자영알뜰',
  NHO: 'NH-OIL',
  E1G: 'E1',
  SOG: 'SK가스',
  ETC: '자영/기타',
  EXP: '고속도로',
};

export const BRAND_COLOR: Record<BrandCode, string> = {
  SKE: '#EE2737',
  GSC: '#00833F',
  HDO: '#F58220',
  SOL: '#FFD400',
  RTE: '#00A4E0',
  RTO: '#005EB8',
  NHO: '#7AC143',
  E1G: '#0033A0',
  SOG: '#E2231A',
  ETC: '#666666',
  EXP: '#7C3AED', // 보라 — 일반 정유사/알뜰과 시각적으로 또렷이 구분
};

export type SidoCode =
  | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09'
  | '10' | '11' | '14' | '15' | '16' | '17' | '18' | '19';

export const SIDO_NAME: Record<SidoCode, string> = {
  '01': '서울', '02': '경기', '03': '강원', '04': '충북', '05': '충남',
  '06': '전북', '07': '전남', '08': '경북', '09': '경남', '10': '부산',
  '11': '제주', '14': '대구', '15': '인천', '16': '광주', '17': '대전',
  '18': '울산', '19': '세종',
};

/** 1개 주유소의 정적 정보 (브랜드/위치/부가서비스) */
export interface StationBase {
  id: string;
  name: string;
  brand: BrandCode;
  isSelf: boolean;
  sido: SidoCode;
  sigungu?: string;
  address: string;
  tel?: string;
  hasCarwash?: boolean;
  hasCvs?: boolean;
  hasMaintenance?: boolean;
  /** LPG 겸업 여부 (Opinet LPG_YN='Y'/'C') */
  hasLpg?: boolean;
  /** 품질인증주유소 여부 (Opinet KPETRO_YN='Y') */
  isKpetro?: boolean;
  /** 부가서비스 마지막 보강 시각(ISO). null/undefined면 미보강 */
  amenitiesUpdatedAt?: string | null;
  /** 고속도로(휴게소) 주유소 여부 — 한국도로공사 데이터로 적재된 건. UI에서 '고속도로' 배지에 사용. */
  isHighway?: boolean;
  /** 고속도로 노선명(예: 경부선) — isHighway일 때만 채워짐 */
  routeName?: string | null;
  /** 고속도로 방향(예: 부산) — isHighway일 때만 채워짐 */
  direction?: string | null;
  lat: number;
  lng: number;
}

/** 가격 정보를 포함한 주유소 (지도/리스트 표시용) */
export interface StationWithPrice extends StationBase {
  product: ProductCode;
  price: number;       // 원/L
  tradeDate: string;   // YYYY-MM-DD
  /** 사용자 위치로부터의 거리(m). radius 응답에만 채워짐 */
  distance?: number;
}

/** 주유소 상세: 모든 유종 가격 포함 */
export interface StationDetail extends StationBase {
  prices: Record<ProductCode, { price: number; tradeDate: string } | null>;
}

/** 가격 없이 위치/브랜드만 가진 주유소 점 — 지도 회색 점(비하이라이트) 렌더용 */
export interface StationPoint {
  id: string;
  name: string;
  brand: BrandCode;
  isSelf: boolean;
  lat: number;
  lng: number;
}

export interface StationsInBboxResponse {
  stations: StationPoint[];
  bbox: { sw: [number, number]; ne: [number, number] };
  cachedAt: string;
  ttlSec: number;
}

export interface BboxResponse {
  stations: StationWithPrice[];
  bbox: { sw: [number, number]; ne: [number, number] };
  zoom: number;
  cachedAt: string;
  ttlSec: number;
}

export interface RadiusResponse {
  stations: StationWithPrice[];
  center: [number, number];
  radius: number;
  averagePrice?: number;
  cachedAt: string;
  ttlSec: number;
}

/** 전국 최저가 TOP10 1건 (지도 핀/메달 강조 대상) */
export interface NationalTop10Item {
  id: string;
  name: string;
  brand: BrandCode;
  lat: number;
  lng: number;
  price: number;
  rank: number;       // 1~10 (전국 순위)
}

export interface NationalTop10Response {
  product: ProductCode;
  stations: NationalTop10Item[];
  cachedAt: string;
  ttlSec: number;
}

export interface AvgPriceResponse {
  product: ProductCode;
  nation: number;
  sido: Array<{ code: SidoCode; name: string; price: number }>;
  asOf: string;
}

/** 경로(직선) 끝점 — 출발/도착 지점 */
export interface RoutePoint {
  lat: number;
  lng: number;
  name?: string;
}

/**
 * 경로별 최저가 결과 — route 페이지에서 찾은 뒤 메인 지도로 전달해
 * 도로 경로 Polyline + 출발/도착 마커 + 최저가 주유소 마커를 표시하고,
 * 주행 중 근접 알림 대상으로 사용한다.
 */
export interface RoutePlan {
  from: RoutePoint;
  to: RoutePoint;
  product: ProductCode;
  /** 경로(도로 선) buffer 내 최저가 주유소들(가격 오름차순). distance=경로(선)로부터의 거리(m). */
  stations: StationWithPrice[];
  /**
   * 지도에 그릴 경로 점들(주행 순서). 카카오내비 도로 경로면 도로를 따라가고,
   * directions 실패(폴백) 시 출발/도착 직선 2점이 들어온다.
   */
  path: RoutePoint[];
}
