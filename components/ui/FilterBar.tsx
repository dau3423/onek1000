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
  const { product, setProduct, layer, setLayer } = useMapStore();
  // 휘발유 드롭다운 열림 여부
  const [gasOpen, setGasOpen] = useState(false);
  const gasRef = useRef<HTMLDivElement>(null);

  const isEv = layer === 'ev';
  // 현재 선택이 휘발유 계열(일반/고급)인지 — 칩 활성/라벨 판정에 사용
  const gasSelected = !isEv && (GASOLINE_OPTIONS as ProductCode[]).includes(product);

  // 유종 칩(휘발유/경유/LPG) 선택 — EV 모드였다면 주유소 레이어로 되돌리고 유종 적용
  const selectFuel = (p: ProductCode) => {
    if (isEv) setLayer('gas');
    setProduct(p);
  };

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
      {/*
        휘발유 드롭다운(일반/고급) — 스크롤 컨테이너 밖에 둔다.
        overflow-x-auto 컨테이너 안에 두면 overflow-y도 자동으로 잘라(clip) 드롭다운 패널이 안 보임.
        휘발유는 항상 첫 칩이라 스크롤 대상에서 빠져도 UX상 자연스럽다.
      */}
      <div ref={gasRef} className="relative z-20 shrink-0">
        <button
          onClick={() => {
            // 휘발유 칩: EV 모드였다면 주유소로 전환하며 드롭다운 토글
            if (isEv) {
              setLayer('gas');
              setProduct('B027');
              setGasOpen(true);
            } else {
              setGasOpen((v) => !v);
            }
          }}
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
            className="absolute left-0 top-9 z-50 w-32 rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {GASOLINE_OPTIONS.map((p) => {
              const active = !isEv && product === p;
              return (
                <button
                  key={p}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    selectFuel(p);
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

      {/* 나머지 칩: 좁은 화면에서 가로 스크롤. 좌→우: 경유 · LPG · EV */}
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
        {/* 경유 · LPG 단독 칩 */}
        {SIMPLE_PRODUCTS.map((p) => (
          <button
            key={p}
            onClick={() => selectFuel(p)}
            className={clsx(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
              !isEv && product === p
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            {PRODUCT_LABEL[p]}
          </button>
        ))}

        {/* EV 칩 — 클릭 시 충전소 레이어로 전환. 유종 칩과 동일 강조 스타일로 통일. */}
        <button
          onClick={() => setLayer('ev')}
          aria-pressed={isEv}
          className={clsx(
            'flex shrink-0 items-center gap-0.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
            isEv
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
          )}
        >
          <span aria-hidden>⚡</span>
          <span>EV</span>
        </button>
      </div>

      {/* 브랜드별 보기(회원 전용) — 맨 뒤(우측)에 고정. 주유소(gas) 레이어에서만 의미 있음. */}
      {!isEv && <BrandFilter />}
    </div>
  );
}
