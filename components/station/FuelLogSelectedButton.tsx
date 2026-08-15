'use client';

// CTA의 "여기서 주유" 버튼 — 선택 유종의 단가/라벨을 컨텍스트에서 받아 FuelLogButton에 넘긴다.
// 추이 탭과 CTA가 떨어져 있어도 같은 선택 유종을 쓰도록 FuelSelectionProvider를 경유한다.
import { PRODUCT_LABEL, type StationDetail } from '@/types/station';
import { FuelLogButton } from './FuelLogButton';
import { useFuelSelection } from './FuelSelectionProvider';

export function FuelLogSelectedButton({
  stationId,
  prices,
}: {
  stationId: string;
  prices: StationDetail['prices'];
}) {
  const { selected } = useFuelSelection();
  return (
    <FuelLogButton
      stationId={stationId}
      unitPrice={prices[selected]?.price ?? null}
      productLabel={PRODUCT_LABEL[selected]}
    />
  );
}
