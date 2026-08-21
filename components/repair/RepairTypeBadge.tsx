'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { RepairShopType } from '@/types/repair';

/**
 * 유형별 뱃지 글리프(currentColor, viewBox 0 0 24 24) — 마커(repairMarker.ts)와 동일 형태로 맞춰
 * 마커·목록·상세의 시각 일관성을 유지한다(CarwashTypeBadge 와 동형).
 */
const TYPE_GLYPH: Record<RepairShopType, React.ReactNode> = {
  general: (
    <>
      <path d="M14.7 3.6a4.6 4.6 0 0 0-5.5 5.9L3.6 15.1a1.9 1.9 0 1 0 2.7 2.7l5.6-5.6a4.6 4.6 0 0 0 5.9-5.5l-2.7 2.7-2.6-.7-.7-2.6z" />
      <rect x="14.4" y="13.2" width="2.3" height="7.6" rx="1.1" transform="rotate(-45 15.5 17)" />
    </>
  ),
  small: <path d="M15.2 3.4a4.9 4.9 0 0 0-5.9 6.2L3.5 15.4a2 2 0 1 0 2.9 2.9l5.8-5.8a4.9 4.9 0 0 0 6.2-5.9l-2.9 2.9-2.8-.8-.8-2.8z" />,
  specialty: <path d="M6.4 4.2 8.9 6.7 7.5 8.1 5 5.6a3.6 3.6 0 0 0 4.6 4.6l7.3 7.3a1.9 1.9 0 1 0 2.7-2.7l-7.3-7.3A3.6 3.6 0 0 0 8.7 3l-2.3 1.2z" />,
  engine: (
    <>
      <rect x="9" y="3.6" width="6" height="7.2" rx="1.2" />
      <rect x="10.7" y="10.8" width="2.6" height="5.2" />
      <rect x="7.4" y="16" width="9.2" height="4.4" rx="1.4" />
    </>
  ),
  unknown: (
    <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="800">?</text>
  ),
};

// 라이트 팔레트(색 단독 금지 — 라벨 텍스트와 병기). 세차장(blue/violet/cyan)과 겹치지 않게
// amber~stone 계열로 잡되, 주유소 가격 tier(적/황/녹)와도 혼동되지 않도록 채도를 낮춘다.
const BADGE_LIGHT: Record<RepairShopType, string> = {
  general: 'bg-amber-50 text-amber-800 border-amber-200',
  small: 'bg-orange-50 text-orange-800 border-orange-200',
  specialty: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  engine: 'bg-stone-100 text-stone-700 border-stone-300',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
};

const BADGE_DARK: Record<RepairShopType, string> = {
  general: 'dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  small: 'dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  specialty: 'dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
  engine: 'dark:bg-stone-800 dark:text-stone-300 dark:border-stone-600',
  unknown: 'dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

/**
 * 정비업체 유형 뱃지 — 목록(sm)·상세(md) 공용.
 * 색만으로 구분하지 않도록 글리프 + 라벨을 항상 병기한다(접근성/색각).
 * forceLight=true면 dark: 변형 없이 라이트 팔레트만 렌더(상세 페이지처럼 라이트 전용 화면용).
 */
export function RepairTypeBadge({
  type,
  size = 'sm',
  forceLight = false,
}: {
  type: RepairShopType;
  size?: 'sm' | 'md';
  forceLight?: boolean;
}) {
  const t = useTranslations('repair.typeLabel');
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border font-bold leading-none',
        size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]',
        BADGE_LIGHT[type],
        !forceLight && BADGE_DARK[type],
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'}
        aria-hidden="true"
      >
        {TYPE_GLYPH[type]}
      </svg>
      {t(type)}
    </span>
  );
}
