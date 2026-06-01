'use client';

import { useState } from 'react';
import { useMapStore } from '@/stores/map';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import { MarkerLegend } from './MarkerLegend';
import { BrandFilter } from './BrandFilter';
import clsx from 'clsx';

const PRODUCTS: ProductCode[] = ['B027', 'D047', 'B034', 'C004'];

export function FilterBar() {
  const { product, setProduct } = useMapStore();
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div className="relative flex items-center gap-1.5 border-b border-gray-100 bg-white px-3 py-2">
      {/* 유종 버튼: 좁은 화면에서 가로 스크롤 */}
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
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

      {/* 브랜드별 보기(회원 전용) — 유종 버튼 우측에 고정 */}
      <BrandFilter />

      {/* 색상 의미 안내 — 유종 버튼 우측 끝에 고정(스크롤되지 않음) */}
      <button
        onClick={() => setLegendOpen((v) => !v)}
        aria-label="색상 안내"
        aria-expanded={legendOpen}
        className={clsx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition',
          legendOpen
            ? 'border-primary bg-primary text-white'
            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100',
        )}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9.5" />
          <path strokeLinecap="round" d="M12 11v5" />
          <circle cx="12" cy="7.8" r="0.1" strokeWidth={2.6} />
        </svg>
      </button>

      {legendOpen && <MarkerLegend onClose={() => setLegendOpen(false)} />}
    </div>
  );
}
