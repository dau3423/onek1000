// 1000냥 주유소 - 공통 타입 정의

export type ProductCode = 'B027' | 'B034' | 'D047' | 'K015' | 'C004';

export const PRODUCT_LABEL: Record<ProductCode, string> = {
  B027: '휘발유',
  B034: '고급휘발유',
  D047: '경유',
  K015: '실내등유',
  C004: 'LPG',
};

// 현재 서비스가 취급(동기화/필터/차량 선택)하는 유종 — 휘발유/경유 2종.
// PRODUCT_LABEL/ProductCode 타입 정의는 상세 페이지(실시간 Opinet 5종 표시)가 쓰므로
// 그대로 두되, "취급/노출 목록"은 이 상수를 단일 소스로 참조한다.
export const HANDLED_PRODUCTS: ProductCode[] = ['B027', 'D047'];

/** 취급 유종 여부 (서버 검증용) */
export function isHandledProduct(v: unknown): v is ProductCode {
  return typeof v === 'string' && (HANDLED_PRODUCTS as string[]).includes(v);
}

export type BrandCode = 'SKE' | 'GSC' | 'HDO' | 'SOL' | 'RTE' | 'ETC' | 'RTO' | 'NHO' | 'E1G' | 'SOG';

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
