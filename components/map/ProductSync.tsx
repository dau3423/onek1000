'use client';

// 로그인 사용자의 기본 차량 유종을 지도 필터 기본값으로 자동 선택한다.
// 세션(서버 검증)에서 defaultProduct를 읽어 store에 1회 반영하며,
// 사용자가 필터바에서 직접 바꾼 경우에는 덮어쓰지 않는다(initProductFromVehicle 내부 가드).
// 비로그인/미등록 시에는 기존 B027이 유지된다(아무 동작 안 함).
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useMapStore } from '@/stores/map';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';

export function ProductSync() {
  const { data } = useSession();
  const initProductFromVehicle = useMapStore((s) => s.initProductFromVehicle);

  useEffect(() => {
    const fuel = data?.user?.defaultProduct;
    if (fuel && fuel in PRODUCT_LABEL) {
      initProductFromVehicle(fuel as ProductCode);
    }
  }, [data?.user?.defaultProduct, initProductFromVehicle]);

  return null;
}
