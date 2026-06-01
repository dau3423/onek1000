'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '@/stores/map';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import { BrandFilter } from './BrandFilter';
import clsx from 'clsx';

// 휘발유 드롭다운에 묶을 유종(일반/고급). 칩 라벨은 현재 선택을 반영한다.
const GASOLINE_OPTIONS: ProductCode[] = ['B027', 'B034'];
// 단독 칩으로 나열할 유종(휘발유 드롭다운/EV 제외).
const SIMPLE_PRODUCTS: ProductCode[] = ['D047', 'C004'];

export function FilterBar() {
  const { product, setProduct } = useMapStore();
  // 휘발유 드롭다운 열림 여부
  const [gasOpen, setGasOpen] = useState(false);
  const gasRef = useRef<HTMLDivElement>(null);

  // 현재 선택이 휘발유 계열(일반/고급)인지 — 칩 활성/라벨 판정에 사용
  const gasSelected = (GASOLINE_OPTIONS as ProductCode[]).includes(product);
  // EV는 유효 ProductCode가 아니므로 store에 넣지 않고 준비중으로만 처리.

  // 바깥 클릭 / ESC로 휘발유 드롭다운 닫기
  useEffect(() => {
    if (!gasOpen) return;
    function onDown(e: MouseEvent) {
      if (gasRef.current && !gasRef.current.contains(e.target as Node)) setGasOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setGasOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [gasOpen]);

  return (
    <div className="relative flex items-center gap-1.5 border-b border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
      {/* 유종 버튼: 좁은 화면에서 가로 스크롤. 좌→우: 휘발유▾ · 경유 · LPG · EV(준비중) */}
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
        {/* 휘발유 드롭다운(일반/고급) — 칩 라벨은 현재 선택을 반영 */}
        <div ref={gasRef} className="relative shrink-0">
          <button
            onClick={() => setGasOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={gasOpen}
            aria-label="휘발유 유종 선택"
            className={clsx(
              'flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition',
              gasSelected
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            {/* 휘발유 계열이 선택돼 있으면 그 라벨(휘발유/고급휘발유), 아니면 기본 "휘발유" */}
            <span>{gasSelected ? PRODUCT_LABEL[product] : PRODUCT_LABEL.B027}</span>
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {gasOpen && (
            <div
              role="menu"
              className="absolute left-0 top-9 z-40 w-32 rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
            >
              {GASOLINE_OPTIONS.map((p) => {
                const active = product === p;
                return (
                  <button
                    key={p}
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      setProduct(p);
                      setGasOpen(false);
                    }}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                    )}
                  >
                    {PRODUCT_LABEL[p]}
                    {active && (
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 경유 · LPG 단독 칩 */}
        {SIMPLE_PRODUCTS.map((p) => (
          <button
            key={p}
            onClick={() => setProduct(p)}
            className={clsx(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
              product === p
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            {PRODUCT_LABEL[p]}
          </button>
        ))}

        {/* EV — 데이터 소스 없음(준비 중). 비활성 처리로 앱이 깨지지 않게 한다. */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="전기차 충전소는 준비 중입니다"
          className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400 dark:bg-gray-800 dark:text-gray-500"
        >
          <span>EV</span>
          <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            준비중
          </span>
        </button>
      </div>

      {/* 브랜드별 보기(회원 전용) — 맨 뒤(우측)에 고정 */}
      <BrandFilter />
    </div>
  );
}
