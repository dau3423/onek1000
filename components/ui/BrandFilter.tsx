'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMapStore } from '@/stores/map';
import { BRAND_COLOR, type BrandCode } from '@/types/station';
import { useBrandLabel } from '@/lib/i18n/labels';
import { DropletIcon } from '@/components/icons';
import { track } from '@/lib/analytics';
import clsx from 'clsx';

// 필터에 노출할 브랜드 순서 (주요 정유사 → 알뜰 → 고속도로 → 기타 → LPG)
const BRAND_OPTIONS: BrandCode[] = [
  'SKE', 'GSC', 'HDO', 'SOL', 'RTE', 'RTO', 'NHO', 'EXP', 'ETC', 'E1G', 'SOG',
];

// 필터 칩 전용 라벨 오버라이드 — 마커/상세 등 좁은 곳은 카탈로그의 '고속도로'를 그대로 쓰고,
// 필터 칩에서만 사용자가 식별하기 쉽게 '고속도로(휴게소)'로 노출한다.
const FILTER_LABEL_OVERRIDE: Partial<Record<BrandCode, boolean>> = {
  EXP: true,
};

/**
 * 브랜드별 필터 (비회원 포함 누구나 사용 가능).
 * - 미선택(빈 배열) = 전체 표시.
 * - 마커 필터링은 클라이언트/우리 DB 조회라 로그인 불필요 — 가입 전 가치 체험을 위해 개방.
 * - 다중 선택 칩으로 실제 필터 동작.
 */
export function BrandFilter() {
  const t = useTranslations('map.brandFilter');
  const brandLabel = useBrandLabel();
  // '세차 가능'(has_carwash)도 이 드롭다운 안에 함께 둔다 — 필터바를 1행으로 줄이면서
  // 브랜드와 AND 교집합으로 걸리는 같은 성격의 조회 필터라 한 곳에 모았다.
  const { brands, toggleBrand, clearBrands, carwashOnly, toggleCarwashOnly } = useMapStore();
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
        aria-label={t('ariaLabel')}
        aria-expanded={open}
        title={t('title')}
        className={clsx(
          'flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition',
          // 브랜드 선택 또는 세차 가능 중 하나라도 켜져 있으면 활성 표시(접힌 상태에서도 필터가 걸린 걸 알 수 있게).
          count > 0 || carwashOnly
            ? 'border-primary bg-primary text-white'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
        )}
      >
        <span>{t('label')}{count > 0 ? ` ${count}` : ''}</span>
        {/* 세차 가능이 켜져 있으면 접힌 상태에서도 물방울로 표시 */}
        {carwashOnly && <DropletIcon className="h-3 w-3 shrink-0" />}
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute right-0 top-9 z-40 w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              {t('dropdownTitle')}
            </span>
            {count > 0 && (
              <button
                onClick={clearBrands}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {t('clearAll')}
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
                  {FILTER_LABEL_OVERRIDE[b] ? t('expLabel') : brandLabel(b)}
                </button>
              );
            })}
          </div>

          {/* ─── 세차 가능 ─── 브랜드와 AND 교집합으로 걸리는 조회 필터.
              ⚠️ 표시 문자열만 "세차 가능" — 계측 이벤트 키(carwash_filter_on)는 불변. */}
          <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-700">
            <button
              onClick={() => {
                // OFF→ON 전이에만 계측 1건(현재 값 기준 판정 — 켜질 때만).
                if (!carwashOnly) track('carwash_filter_on');
                toggleCarwashOnly();
              }}
              aria-pressed={carwashOnly}
              className={clsx(
                'flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition',
                carwashOnly
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
              )}
            >
              <DropletIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{t('carwashOnlyOption')}</span>
              {carwashOnly && (
                <svg viewBox="0 0 24 24" className="ml-auto h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
