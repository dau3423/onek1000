import { create } from 'zustand';
import type { ProductCode } from '@/types/station';

interface MapState {
  product: ProductCode;
  setProduct: (p: ProductCode) => void;

  selfOnly: boolean;
  toggleSelfOnly: () => void;

  selectedStationId: string | null;
  selectStation: (id: string | null) => void;

  alertDismissed: boolean;
  dismissAlert: () => void;
  resetAlert: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  product: 'B027',
  setProduct: (p) => set({ product: p, alertDismissed: false }),

  selfOnly: false,
  toggleSelfOnly: () => set((s) => ({ selfOnly: !s.selfOnly })),

  selectedStationId: null,
  selectStation: (id) => set({ selectedStationId: id }),

  alertDismissed: false,
  dismissAlert: () => set({ alertDismissed: true }),
  resetAlert: () => set({ alertDismissed: false }),
}));
