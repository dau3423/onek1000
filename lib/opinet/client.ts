// Opinet 무료 API 클라이언트
// 환경변수 NEXT_PUBLIC_USE_MOCK=true 인 경우 mock 데이터 반환.
// false 인 경우 실제 Opinet API 호출 (서버 사이드 전용 — OPINET_API_KEY 필요).

import type { ProductCode, StationWithPrice, SidoCode, StationDetail, BrandCode } from '@/types/station';
import { BRAND_LABEL } from '@/types/station';
import { getMockStations, getMockStationDetail } from '@/lib/mock/stations';
import { distanceMeters, inBbox, type Bbox } from '@/lib/map/geo';
import { katecToWgs84 } from '@/lib/map/katec';

/** Opinet 브랜드 코드 정규화 — 알 수 없는 값은 'ETC'로 폴백 */
function toBrandCode(raw?: string): BrandCode {
  const v = (raw ?? '').trim();
  return (v && v in BRAND_LABEL ? v : 'ETC') as BrandCode;
}

const BASE = 'https://www.opinet.co.kr/api';
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';

function key() {
  const k = process.env.OPINET_API_KEY;
  if (!k) throw new Error('OPINET_API_KEY is missing. Set USE_MOCK=true or provide the key.');
  return k;
}

async function callOpinet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set('code', key());
  url.searchParams.set('out', 'json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { next: { revalidate: 600 } }); // 10분 ISR
  if (!res.ok) throw new Error(`Opinet ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// Public API (mock/real 동일 시그니처)
// ─────────────────────────────────────────────

/** 화면 영역(bbox) 내 주유소 — mock에선 전체에서 필터, real에선 시도별 TOP20 합집합 후 필터 */
export async function fetchStationsByBbox(
  bbox: Bbox,
  product: ProductCode,
  limit = 100,
): Promise<StationWithPrice[]> {
  const pool = USE_MOCK
    ? getMockStations(product)
    : await fetchAllStationsByRegion(product); // TODO: real path
  const filtered = pool
    .filter((s) => inBbox(s.lat, s.lng, bbox))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
  return filtered;
}

/** 반경 R 미터 내 주유소 — GPS 알람용 */
export async function fetchStationsByRadius(
  lat: number, lng: number, radiusM: number,
  product: ProductCode,
  limit = 20,
): Promise<StationWithPrice[]> {
  if (USE_MOCK) {
    return getMockStations(product)
      .map((s) => ({ ...s, distance: distanceMeters(lat, lng, s.lat, s.lng) }))
      .filter((s) => (s.distance ?? Infinity) <= radiusM)
      .sort((a, b) => a.price - b.price)
      .slice(0, limit);
  }
  // Real: Opinet aroundAll
  type Raw = { RESULT: { OIL: Array<{ UNI_ID: string; OS_NM: string; POLL_DVS_CD: string; PRICE: number; KPETRO_PRICE: number; GIS_X_COORD: number; GIS_Y_COORD: number; NEW_ADR: string; }> } };
  const raw = await callOpinet<Raw>('aroundAll.do', {
    x: String(lng), y: String(lat),
    radius: String(radiusM),
    prodcd: product,
    sort: '1',
  });
  return (raw.RESULT?.OIL ?? []).slice(0, limit).map((o) => ({
    id: o.UNI_ID,
    name: o.OS_NM,
    brand: toBrandCode(o.POLL_DVS_CD),
    isSelf: false,
    sido: '01' as SidoCode,
    address: o.NEW_ADR,
    lat: o.GIS_Y_COORD,
    lng: o.GIS_X_COORD,
    product,
    price: o.PRICE,
    tradeDate: new Date().toISOString().slice(0, 10),
    distance: distanceMeters(lat, lng, o.GIS_Y_COORD, o.GIS_X_COORD),
  }));
}

/** 주유소 상세 */
export async function fetchStationDetail(id: string): Promise<StationDetail | null> {
  if (USE_MOCK) return getMockStationDetail(id) as StationDetail | null;
  // detailById.do 실제 응답 키 기준 (POLL_DIV_CO, GIS_X_COOR/Y_COOR=KATEC 등)
  type Raw = {
    RESULT: {
      OIL: Array<{
        UNI_ID: string; OS_NM: string; POLL_DIV_CO: string; GPOLL_DIV_CO?: string;
        VAN_ADR: string; NEW_ADR: string; TEL: string; SIGUNCD?: string;
        LPG_YN: string; MAINT_YN: string; CAR_WASH_YN: string; KPETRO_YN?: string;
        CVS_YN: string; GOOD_YN?: string;
        GIS_X_COOR: number; GIS_Y_COOR: number;
        OIL_PRICE: Array<{ PRODCD: string; PRICE: number; TRADE_DT: string }>;
      }>;
    };
  };
  const raw = await callOpinet<Raw>('detailById.do', { id });
  const o = raw.RESULT?.OIL?.[0];
  if (!o) return null;
  const prices: StationDetail['prices'] = {
    B027: null, B034: null, D047: null, K015: null, C004: null,
  };
  for (const p of o.OIL_PRICE ?? []) {
    const code = p.PRODCD as ProductCode;
    if (code in prices) prices[code] = { price: p.PRICE, tradeDate: p.TRADE_DT };
  }
  // 좌표는 KATEC → WGS84 변환 (sync와 동일). 실패 시 0 폴백.
  const wgs = katecToWgs84(Number(o.GIS_X_COOR), Number(o.GIS_Y_COOR));
  return {
    id: o.UNI_ID,
    name: o.OS_NM,
    brand: toBrandCode(o.POLL_DIV_CO),
    isSelf: false,
    sido: '01' as SidoCode,
    address: o.NEW_ADR || o.VAN_ADR,
    tel: o.TEL,
    lat: wgs?.lat ?? 0,
    lng: wgs?.lng ?? 0,
    hasCarwash: o.CAR_WASH_YN === 'Y',
    hasCvs: o.CVS_YN === 'Y',
    hasMaintenance: o.MAINT_YN === 'Y',
    prices,
  };
}

/** 시도별 평균가 */
export async function fetchAvgBySido(product: ProductCode) {
  if (USE_MOCK) {
    const all = getMockStations(product);
    const map = new Map<string, number[]>();
    for (const s of all) {
      if (!map.has(s.sido)) map.set(s.sido, []);
      map.get(s.sido)!.push(s.price);
    }
    return Array.from(map.entries()).map(([code, arr]) => ({
      code: code as SidoCode,
      price: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    }));
  }
  type Raw = { RESULT: { OIL: Array<{ SIDOCD: string; PRICE: number }> } };
  const raw = await callOpinet<Raw>('avgSidoPrice.do', { prodcd: product });
  return (raw.RESULT?.OIL ?? []).map((o) => ({ code: o.SIDOCD as SidoCode, price: o.PRICE }));
}

/** Real 모드에서 전국을 시도별 TOP20을 모아 풀로 만드는 헬퍼 (MVP는 mock 사용) */
async function fetchAllStationsByRegion(product: ProductCode): Promise<StationWithPrice[]> {
  const sidos: SidoCode[] = ['01','02','03','04','05','06','07','08','09','10','11','14','15','16','17','18','19'];
  type Raw = {
    RESULT: { OIL: Array<{ UNI_ID: string; OS_NM: string; POLL_DVS_CD: string; PRICE: number; GIS_X_COORD: number; GIS_Y_COORD: number; NEW_ADR: string }> };
  };
  const all: StationWithPrice[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const sido of sidos) {
    const raw = await callOpinet<Raw>('lowTop10.do', { area: sido, prodcd: product, cnt: '20' });
    for (const o of raw.RESULT?.OIL ?? []) {
      all.push({
        id: o.UNI_ID, name: o.OS_NM, brand: toBrandCode(o.POLL_DVS_CD),
        isSelf: false, sido, address: o.NEW_ADR,
        lat: o.GIS_Y_COORD, lng: o.GIS_X_COORD,
        product, price: o.PRICE, tradeDate: today,
      });
    }
  }
  return all;
}
