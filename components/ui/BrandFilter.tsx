'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useMapStore } from '@/stores/map';
import { BRAND_LABEL, BRAND_COLOR, type BrandCode } from '@/types/station';
import clsx from 'clsx';

// 필터에 노출할 브랜드 순서 (주요 정유사 → 알뜰 → 기타 → LPG)
const BRAND_OPTIONS: BrandCode[] = [
  'SKE', 'GSC', 'HDO', 'SOL', 'RTE', 'RTO', 'NHO', 'ETC', 'E1G', 'SOG',
];

/**
 * 브랜드별 필터 (회원 전용).
 * - 미선택(빈 배열) = 전체 표시.
 * - 비로그인 사용자는 잠금 처리, 누르면 로그인 유도.
 * - 로그인 사용자만 다중 선택 칩으로 실제 필터 동작.
 */
export function BrandFilter() {
  const { status } = useSession();
  const signedIn = status === 'authenticated';
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
    if (!signedIn) {
      // 비로그인: 로그인 유도 (현재 화면으로 복귀)
      signIn(undefined, { callbackUrl: '/' });
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={handleClick}
        aria-label={signedIn ? '브랜드 필터' : '로그인하고 브랜드 필터 사용'}
        aria-expanded={open}
        title={signedIn ? '브랜드별 보기' : '로그인하고 브랜드 필터 사용'}
        className={clsx(
          'flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition',
          count > 0
            ? 'border-primary bg-primary text-white'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
        )}
      >
        {/* 비로그인 시 잠금 아이콘 */}
        {!signedIn && (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        )}
        <span>브랜드{count > 0 ? ` ${count}` : ''}</span>
      </button>

      {/* 드롭다운: 로그인 사용자에게만 열림 */}
      {open && signedIn && (
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
                  {BRAND_LABEL[b]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
