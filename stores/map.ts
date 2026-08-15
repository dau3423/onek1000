import { create } from 'zustand';
import type { ProductCode, BrandCode, RoutePlan } from '@/types/station';

/** 마지막으로 보던 지도 시점(중심 좌표 + 카카오 level). 상세보기 왕복 시 복원에 사용. */
export interface MapView {
  lat: number;
  lng: number;
  level: number;
}

const LAST_VIEW_KEY = 'onek:lastView';

/**
 * sessionStorage에서 마지막 지도 시점을 읽는다.
 * zustand 메모리 상태는 SPA 네비 동안 유지되지만, 새로고침 견고성을 위해 sessionStorage도 병행한다.
 */
function readLastView(): MapView | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_VIEW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<MapView>;
    if (typeof v.lat === 'number' && typeof v.lng === 'number' && typeof v.level === 'number') {
      return { lat: v.lat, lng: v.lng, level: v.level };
    }
  } catch {
    // 손상된 값은 무시하고 기본 화면으로
  }
  return null;
}

function writeLastView(v: MapView | null) {
  if (typeof window === 'undefined') return;
  try {
    if (v) window.sessionStorage.setItem(LAST_VIEW_KEY, JSON.stringify(v));
    else window.sessionStorage.removeItem(LAST_VIEW_KEY);
  } catch {
    // 프라이빗 모드 등 sessionStorage 불가 환경은 메모리 상태로만 동작
  }
}

const ROUTE_PLAN_KEY = 'onek:routePlan';
/**
 * 경로 계획의 저장 유효기간(ms). 모바일/PWA가 백그라운드 시 탭을 종료해도
 * 포그라운드 복귀(콜드 리로드) 시 경로가 살아있도록 localStorage에 저장하되,
 * 너무 오래된(예: 어제 검색한) 경로가 계속 복원되는 것을 막기 위한 만료.
 */
const ROUTE_PLAN_TTL_MS = 3 * 60 * 60 * 1000; // 3시간

/** localStorage에 저장하는 래퍼 — savedAt(저장 시각)으로 만료를 판정한다. */
interface StoredRoutePlan {
  savedAt: number;
  plan: RoutePlan;
}

/**
 * 경로 계획(RoutePlan)을 localStorage에서 읽는다.
 * route 페이지 → 메인 지도 이동(SPA 네비)에는 메모리 상태로 충분하나,
 * 모바일 백그라운드 → 포그라운드 콜드 리로드 견고성을 위해 localStorage에 병행 저장한다.
 * (sessionStorage는 탭 종료 시 날아가 복원이 안 됨 → localStorage + 만료로 대체)
 */
function readRoutePlan(): RoutePlan | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ROUTE_PLAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRoutePlan>;
    // 만료 검사 — savedAt 없거나 TTL 초과면 복원하지 않고 정리한다.
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > ROUTE_PLAN_TTL_MS) {
      window.localStorage.removeItem(ROUTE_PLAN_KEY);
      return null;
    }
    const v = parsed.plan as Partial<RoutePlan> | undefined;
    if (
      v && v.from && typeof v.from.lat === 'number' && typeof v.from.lng === 'number'
      && v.to && typeof v.to.lat === 'number' && typeof v.to.lng === 'number'
      && Array.isArray(v.stations)
    ) {
      // path(도로 경로 점들)는 신규 필드 — 구버전 저장값엔 없을 수 있어 직선 2점으로 보강.
      const path = Array.isArray(v.path) && v.path.length >= 2
        ? v.path
        : [{ lat: v.from.lat, lng: v.from.lng }, { lat: v.to.lat, lng: v.to.lng }];
      return { ...v, path } as RoutePlan;
    }
    // 손상/구버전 값은 정리하고 무시.
    window.localStorage.removeItem(ROUTE_PLAN_KEY);
  } catch {
    // 손상된 값은 무시
  }
  return null;
}

function writeRoutePlan(v: RoutePlan | null) {
  if (typeof window === 'undefined') return;
  try {
    if (v) {
      const stored: StoredRoutePlan = { savedAt: Date.now(), plan: v };
      window.localStorage.setItem(ROUTE_PLAN_KEY, JSON.stringify(stored));
    } else {
      window.localStorage.removeItem(ROUTE_PLAN_KEY);
    }
  } catch {
    // localStorage 불가 환경은 메모리 상태로만 동작
  }
}

/** 지도 레이어 — 'gas'=주유소(기존 기본), 'ev'=전기차 충전소. */
export type MapLayer = 'gas' | 'ev';

interface MapState {
  /** 현재 지도 레이어(주유소/충전소 토글). */
  layer: MapLayer;
  setLayer: (l: MapLayer) => void;

  product: ProductCode;
  /** 사용자가 필터바에서 직접 유종을 바꿨는지 — 차량 기본 유종 자동 선택보다 우선 */
  productUserSet: boolean;
  setProduct: (p: ProductCode) => void;
  /** 차량 기본 유종으로 초기화(사용자가 직접 바꾼 적 없을 때만 적용) */
  initProductFromVehicle: (p: ProductCode) => void;

  /**
   * 브랜드 필터(회원 전용). 빈 배열=전체 표시.
   * 선택된 브랜드만 지도 마커로 노출하는 client-side 필터에 사용.
   */
  brands: BrandCode[];
  toggleBrand: (b: BrandCode) => void;
  setBrands: (b: BrandCode[]) => void;
  clearBrands: () => void;

  selectedStationId: string | null;
  selectStation: (id: string | null) => void;

  alertDismissed: boolean;
  dismissAlert: () => void;
  resetAlert: () => void;

  /** 마지막 지도 시점(중심/줌). 지도 idle 시 갱신, 홈 마운트 시 복원에 사용. */
  lastView: MapView | null;
  setLastView: (v: MapView) => void;

  /**
   * 경로별 최저가 계획. route 페이지에서 '찾기' 후 설정하면 메인 지도가 이를 읽어
   * 직선 Polyline + 출발/도착/최저가 마커를 표시하고, 주행 중 근접 알림 대상으로 쓴다.
   * null이면 일반 지도 모드.
   */
  routePlan: RoutePlan | null;
  setRoutePlan: (p: RoutePlan | null) => void;
  clearRoutePlan: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  layer: 'gas',
  setLayer: (l) => set({ layer: l }),

  product: 'B027',
  productUserSet: false,
  setProduct: (p) => set({ product: p, productUserSet: true, alertDismissed: false }),
  initProductFromVehicle: (p) =>
    set((s) => (s.productUserSet ? {} : { product: p, alertDismissed: false })),

  brands: [],
  toggleBrand: (b) =>
    set((s) => ({
      brands: s.brands.includes(b) ? s.brands.filter((x) => x !== b) : [...s.brands, b],
    })),
  setBrands: (b) => set({ brands: b }),
  clearBrands: () => set({ brands: [] }),

  selectedStationId: null,
  selectStation: (id) => set({ selectedStationId: id }),

  alertDismissed: false,
  dismissAlert: () => set({ alertDismissed: true }),
  resetAlert: () => set({ alertDismissed: false }),

  lastView: null,
  setLastView: (v) => {
    writeLastView(v);
    set({ lastView: v });
  },

  routePlan: null,
  setRoutePlan: (p) => {
    writeRoutePlan(p);
    set({ routePlan: p });
  },
  clearRoutePlan: () => {
    writeRoutePlan(null);
    set({ routePlan: null });
  },
}));

/** 홈 마운트 시점에 1회 호출 — 메모리 또는 sessionStorage에 저장된 마지막 시점을 반환. */
export function getInitialMapView(): MapView | null {
  return useMapStore.getState().lastView ?? readLastView();
}

/**
 * 홈 마운트 시점에 1회 호출 — 메모리 상태가 있으면 그대로, 없으면(콜드 리로드)
 * localStorage에서 만료(3시간) 이내 경로 계획을 복원해 반환한다.
 */
export function getInitialRoutePlan(): RoutePlan | null {
  return useMapStore.getState().routePlan ?? readRoutePlan();
}
