'use client';

import { useMapStore } from '@/stores/map';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import clsx from 'clsx';

// 취급 유종은 휘발유/경유 2종만 노출 (상세 페이지는 별도로 5종 표시)
const PRODUCTS: ProductCode[] = ['B027', 'D047'];

export function FilterBar() {
  const { product, setProduct } = useMapStore();

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-100 bg-white px-3 py-2">
      {PRODUCTS.map((p) => (
        <button
          key={p}
          onClick={() => setProduct(p)}
          className={clsx(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
            product === p
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
          )}
        >
          {PRODUCT_LABEL[p]}
        </button>
      ))}
    </div>
  );
}
