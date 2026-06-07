'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '@/stores/map';
import { BRAND_LABEL, BRAND_COLOR, type BrandCode } from '@/types/station';
import clsx from 'clsx';

// 필터에 노출할 브랜드 순서 (주요 정유사 → 알뜰 → 고속도로 → 기타 → LPG)
const BRAND_OPTIONS: BrandCode[] = [
  'SKE', 'GSC', 'HDO', 'SOL', 'RTE', 'RTO', 'NHO', 'EXP', 'ETC', 'E1G', 'SOG',
];

// 필터 칩 전용 라벨 오버라이드 — 마커/상세 등 좁은 곳은 BRAND_LABEL('고속도로')를 그대로 쓰고,
// 필터 칩에서만 사용자가 식별하기 쉽게 '고속도로(휴게소)'로 노출한다.
const FILTER_LABEL_OVERRIDE: Partial<Record<BrandCode, string>> = {
  EXP: '고속도로(휴게소)',
};

/**
 * 브랜드별 필터 (비회원 포함 누구나 사용 가능).
 * - 미선택(빈 배열) = 전체 표시.
 * - 마커 필터링은 클라이언트/우리 DB 조회라 로그인 불필요 — 가입 전 가치 체험을 위해 개방.
 * - 다중 선택 칩으로 실제 필터 동작.
 */
export function BrandFilter() {
  const { brands, toggleBrand, clearBrands } = useMapStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const count = brands.length;

  const handleClick = () => {
    setOpen((v) => !v);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={handleClick}
        aria-label="브랜드 필터"
        aria-expanded={open}
        title="브랜드별 보기"
        className={clsx(
          'flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition',
          count > 0
            ? 'border-primary bg-primary text-white'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
        )}
      >
        <span>브랜드{count > 0 ? ` ${count}` : ''}</span>
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute right-0 top-9 z-40 w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              브랜드별 보기 (미선택=전체)
            </span>
            {count > 0 && (
              <button
                onClick={clearBrands}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                전체
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BRAND_OPTIONS.map((b) => {
              const active = brands.includes(b);
              return (
                <button
                  key={b}
                  onClick={() => toggleBrand(b)}
                  className={clsx(
                    'flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700',
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: BRAND_COLOR[b] }}
                  />
                  {FILTER_LABEL_OVERRIDE[b] ?? BRAND_LABEL[b]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
