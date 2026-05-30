import { create } from 'zustand';
import type { ProductCode } from '@/types/station';

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

interface MapState {
  product: ProductCode;
  /** 사용자가 필터바에서 직접 유종을 바꿨는지 — 차량 기본 유종 자동 선택보다 우선 */
  productUserSet: boolean;
  setProduct: (p: ProductCode) => void;
  /** 차량 기본 유종으로 초기화(사용자가 직접 바꾼 적 없을 때만 적용) */
  initProductFromVehicle: (p: ProductCode) => void;

  selfOnly: boolean;
  toggleSelfOnly: () => void;

  selectedStationId: string | null;
  selectStation: (id: string | null) => void;

  alertDismissed: boolean;
  dismissAlert: () => void;
  resetAlert: () => void;

  /** 마지막 지도 시점(중심/줌). 지도 idle 시 갱신, 홈 마운트 시 복원에 사용. */
  lastView: MapView | null;
  setLastView: (v: MapView) => void;
}

export const useMapStore = create<MapState>((set) => ({
  product: 'B027',
  productUserSet: false,
  setProduct: (p) => set({ product: p, productUserSet: true, alertDismissed: false }),
  initProductFromVehicle: (p) =>
    set((s) => (s.productUserSet ? {} : { product: p, alertDismissed: false })),

  selfOnly: false,
  toggleSelfOnly: () => set((s) => ({ selfOnly: !s.selfOnly })),

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
}));

/** 홈 마운트 시점에 1회 호출 — 메모리 또는 sessionStorage에 저장된 마지막 시점을 반환. */
export function getInitialMapView(): MapView | null {
  return useMapStore.getState().lastView ?? readLastView();
}
