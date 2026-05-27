'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import type { StationWithPrice } from '@/types/station';
import { BRAND_LABEL, BRAND_COLOR } from '@/types/station';
import { priceTier } from '@/lib/map/geo';

interface Props {
  stations: StationWithPrice[];
  averagePrice: number;
  onSelect: (s: StationWithPrice) => void;
}

export function BottomSheet({ stations, averagePrice, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const sorted = [...stations].sort((a, b) => a.price - b.price).slice(0, 30);

  return (
    <div
      className={clsx(
        'pointer-events-auto absolute inset-x-0 bottom-0 z-20 rounded-t-2xl bg-white shadow-sheet transition-transform duration-300',
        open ? 'translate-y-0' : 'translate-y-[calc(100%-72px)]',
      )}
      style={{ maxHeight: '70vh' }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3"
      >
        <div className="flex items-center gap-2">
          <div className="h-1 w-9 rounded bg-gray-300" />
          <span className="ml-2 text-sm font-bold text-gray-800">
            이 지역 최저가 TOP {Math.min(sorted.length, 30)}
          </span>
        </div>
        <span className="text-xs text-gray-500">{open ? '접기 ▾' : '펼치기 ▴'}</span>
      </button>
      <div className="max-h-[calc(70vh-48px)] overflow-y-auto pb-[calc(8px+env(safe-area-inset-bottom))]">
        <ul className="divide-y divide-gray-100">
          {sorted.map((s, i) => {
            const tier = priceTier(s.price, averagePrice);
            const tierColor = tier === 'cheap' ? 'text-cheap' : tier === 'expensive' ? 'text-expensive' : 'text-gray-800';
            return (
              <li key={s.id}>
                <button
                  onClick={() => onSelect(s)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50"
                >
                  <span className="w-5 text-center text-xs font-bold text-gray-500">{i + 1}</span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: BRAND_COLOR[s.brand] ?? '#666' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">{s.name}</div>
                    <div className="truncate text-xs text-gray-500">
                      {BRAND_LABEL[s.brand]}{s.isSelf ? ' · 셀프' : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={clsx('text-sm font-extrabold', tierColor)}>
                      ₩{s.price.toLocaleString()}
                    </div>
                    <Link
                      href={`/station/${s.id}`}
                      className="text-[11px] text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      상세 →
                    </Link>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
