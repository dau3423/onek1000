'use client';

// 상세 페이지 스코프의 경량 유종 선택 상태 공유.
// 가격 추이 탭(PriceTrendSection)과 CTA의 주유기록 버튼(FuelLogSelectedButton)이
// 떨어져 있어도 같은 "선택 유종"을 공유하도록 컨텍스트로 묶는다.
// Context.Provider는 DOM 노드를 만들지 않으므로 서버 섹션들을 children으로 감싸도
// 상세 페이지의 시각/DOM 순서는 그대로 보존된다(design 미해결-2 요구).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useMapStore } from '@/stores/map';
import type { ProductCode, StationDetail } from '@/types/station';

// 유종 탭/기본 선택의 나열 순서 — 상세 '유종별 가격'과 동일.
const PRODUCT_ORDER: ProductCode[] = ['B027', 'B034', 'D047', 'K015', 'C004'];

interface FuelSelectionValue {
  /** 현재 선택 유종. */
  selected: ProductCode;
  setSelected: (p: ProductCode) => void;
  /** 이 주유소가 가격을 가진 유종만(PRODUCT_ORDER 순). 탭 노출 대상. */
  available: ProductCode[];
}

const Ctx = createContext<FuelSelectionValue | null>(null);

export function useFuelSelection(): FuelSelectionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFuelSelection must be used within FuelSelectionProvider');
  return v;
}

export function FuelSelectionProvider({
  prices,
  children,
}: {
  prices: StationDetail['prices'];
  children: ReactNode;
}) {
  // 가격이 있는(non-null) 유종만 탭 대상. K015는 sync 미적재로 자연 미노출.
  const available = useMemo(
    () => PRODUCT_ORDER.filter((p) => prices[p] != null),
    [prices],
  );
  // 진입 시 기본 선택: 홈에서 고른 유종. 그 유종 가격이 없으면 가격 있는 첫 유종으로 폴백.
  // 전 유종 null이면 현행 유지(B027) — PriceTrendSection이 탭 없이 휘발유 차트를 그린다.
  const storeProduct = useMapStore((s) => s.product);
  const [selected, setSelected] = useState<ProductCode>(() =>
    available.includes(storeProduct) ? storeProduct : (available[0] ?? 'B027'),
  );

  const value = useMemo(
    () => ({ selected, setSelected, available }),
    [selected, available],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
