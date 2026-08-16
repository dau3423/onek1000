'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useMapStore, type MapLayer } from '@/stores/map';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import type { CarwashTypeFilter } from '@/types/carwash';
import { BrandFilter } from './BrandFilter';
import { BoltIcon, DropletIcon, CarwashIcon, FuelIcon } from '@/components/icons';
import { track } from '@/lib/analytics';
import clsx from 'clsx';

// 휘발유 드롭다운에 묶을 유종(일반/고급). 칩 라벨은 현재 선택을 반영한다.
const GASOLINE_OPTIONS: ProductCode[] = ['B027', 'B034'];
// 단독 칩으로 나열할 유종(휘발유 드롭다운/EV 제외).
const SIMPLE_PRODUCTS: ProductCode[] = ['D047', 'C004'];

// 1행 레이어 전환 세그먼트 — 주유소/EV/세차장. EV·세차장 칩을 대체한다.
const LAYER_OPTIONS: { value: MapLayer; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { value: 'gas', label: '주유소', Icon: FuelIcon },
  { value: 'ev', label: 'EV', Icon: BoltIcon },
  { value: 'carwash', label: '세차장', Icon: CarwashIcon },
];

// 세차장 레이어 유형 세그먼트(FR-3). 'all'=미확인 포함 전체(기본).
const CARWASH_TYPE_OPTIONS: { value: CarwashTypeFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'self', label: '셀프' },
  { value: 'hand', label: '손세차' },
  { value: 'auto', label: '자동' },
];

export function FilterBar() {
  const { product, setProduct, layer, setLayer, carwashOnly, toggleCarwashOnly, carwashType, setCarwashType } =
    useMapStore();
  // 휘발유 드롭다운 열림 여부
  const [gasOpen, setGasOpen] = useState(false);
  const gasRef = useRef<HTMLDivElement>(null);

  const isGas = layer === 'gas';
  const isCarwash = layer === 'carwash';
  // 현재 선택이 휘발유 계열(일반/고급)인지 — 칩 활성/라벨 판정에 사용(gas 레이어에서만 활성).
  const gasSelected = isGas && (GASOLINE_OPTIONS as ProductCode[]).includes(product);

  // 유종 칩(휘발유/경유/LPG) 선택 — gas 레이어의 2행에서만 렌더되지만, 방어적으로 gas 복귀도 처리.
  const selectFuel = (p: ProductCode) => {
    if (!isGas) setLayer('gas');
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
    <div className="relative border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
      {/* 1행: 레이어 전환 세그먼트(주유소/EV/세차장) — 항상 노출, 3등분 채움이라 좁은 폰에서도 스크롤 불필요. */}
      <div className="px-3 pt-2 pb-1.5">
        <div
          role="radiogroup"
          aria-label="지도 레이어"
          className="flex items-center gap-1 rounded-full bg-gray-100 p-1 dark:bg-gray-800"
        >
          {LAYER_OPTIONS.map(({ value, label, Icon }) => {
            const active = layer === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={active}
                aria-label={`${label} 지도`}
                // '주유소' 복귀는 유종을 유지(setProduct 호출 안 함) — B027로 강제 되돌리지 않는다.
                onClick={() => setLayer(value)}
                className={clsx(
                  'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold transition',
                  active
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2행(gas): 유종/필터 컨텍스트 — 휘발유▾ 경유 LPG 세차가능 브랜드▾. */}
      {isGas && (
        <div className="flex items-center gap-1.5 border-t border-gray-100 px-3 py-2 dark:border-gray-800">
          {/*
            휘발유 드롭다운(일반/고급) — 스크롤 컨테이너 밖에 둔다.
            overflow-x-auto 컨테이너 안에 두면 overflow-y도 자동으로 잘라(clip) 드롭다운 패널이 안 보임.
            휘발유는 항상 첫 칩이라 스크롤 대상에서 빠져도 UX상 자연스럽다.
          */}
          <div ref={gasRef} className="relative z-20 shrink-0">
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
                className="absolute left-0 top-9 z-50 w-32 rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
              >
                {GASOLINE_OPTIONS.map((p) => {
                  const active = isGas && product === p;
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

          {/* 경유 · LPG · 세차가능 — 넘칠 경우 대비해 가로 스크롤 유지(레이어 분리로 보통은 스크롤 불필요). */}
          <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
            {/* 경유 · LPG 단독 칩 */}
            {SIMPLE_PRODUCTS.map((p) => (
              <button
                key={p}
                onClick={() => selectFuel(p)}
                className={clsx(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  isGas && product === p
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {PRODUCT_LABEL[p]}
              </button>
            ))}

            {/* '세차 가능' 칩 — 유종/레이어를 바꾸지 않는 "필터 토글". 켜면 세차 가능(has_carwash) 주유소만 조회.
                브랜드 필터와 AND 교집합. ⚠️ 표시 문자열만 "세차 가능" — 계측 이벤트 키(carwash_filter_on)는 불변. */}
            <button
              onClick={() => {
                // OFF→ON 전이에만 계측 1건(현재 값 기준 판정 — 켜질 때만).
                if (!carwashOnly) track('carwash_filter_on');
                toggleCarwashOnly();
              }}
              aria-pressed={carwashOnly}
              className={clsx(
                'flex shrink-0 items-center gap-0.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                carwashOnly
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
              )}
            >
              <DropletIcon className="h-3.5 w-3.5" />
              <span>세차 가능</span>
            </button>
          </div>

          {/* 브랜드별 보기 — 맨 뒤(우측)에 고정. */}
          <BrandFilter />
        </div>
      )}

      {/* 2행(carwash): 세차장 유형 세그먼트 — carwash 레이어에서만 노출(AC-3.1). */}
      {isCarwash && (
        <div className="flex items-center gap-1.5 border-t border-gray-100 px-3 py-2 dark:border-gray-800">
          <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">세차장 유형</span>
          <div className="flex flex-1 items-center gap-1.5 overflow-x-auto" role="radiogroup" aria-label="세차장 유형">
            {CARWASH_TYPE_OPTIONS.map((opt) => {
              const active = carwashType === opt.value;
              return (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCarwashType(opt.value)}
                  className={clsx(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    active
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ev 레이어: EV 전용 필터가 없어 2행을 생략한다. */}
    </div>
  );
}
