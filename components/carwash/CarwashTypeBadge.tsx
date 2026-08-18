'use client';

import clsx from 'clsx';
import type { WashType } from '@/types/carwash';
import { useWashTypeLabel } from '@/lib/i18n/labels';

/**
 * 유형별 뱃지 글리프(currentColor, viewBox 0 0 24 24) — 마커(carwashMarker.ts)·팝업(CarwashPopup)과
 * 동일한 물방울/스펀지·거품/기어/? 형태로 맞춰 마커·범례·팝업·목록·상세의 시각 일관성을 유지(design §2-4).
 */
const TYPE_GLYPH: Record<WashType, React.ReactNode> = {
  self: <path d="M12 4c2.6 3.4 4.5 5.8 4.5 8.2a4.5 4.5 0 0 1-9 0C7.5 9.8 9.4 7.4 12 4z" />,
  hand: (
    <>
      <rect x="6.5" y="10.5" width="11" height="7" rx="1.6" />
      <circle cx="9" cy="7.6" r="1.3" />
      <circle cx="12.5" cy="6.4" r="1.6" />
      <circle cx="16" cy="7.9" r="1.2" />
    </>
  ),
  auto: (
    <>
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="12" cy="12" r="1.7" />
      <rect x="11" y="4.2" width="2" height="2.6" />
      <rect x="11" y="17.2" width="2" height="2.6" />
      <rect x="4.2" y="11" width="2.6" height="2" />
      <rect x="17.2" y="11" width="2.6" height="2" />
    </>
  ),
  unknown: (
    <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="800">?</text>
  ),
};

// 유형 뱃지 라이트 팔레트(색 단독 금지 — 라벨 텍스트와 병기). 라이트 전용 화면(상세)은 이것만 사용.
const BADGE_LIGHT: Record<WashType, string> = {
  self: 'bg-blue-50 text-blue-700 border-blue-200',
  hand: 'bg-violet-50 text-violet-700 border-violet-200',
  auto: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
};

// 다크 변형(라이트/다크 대응 화면=목록·팝업에서만 추가 적용). design §4.
const BADGE_DARK: Record<WashType, string> = {
  self: 'dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  hand: 'dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800',
  auto: 'dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
  unknown: 'dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

/**
 * 세차유형 뱃지 — 목록 아이템(sm)·상세 페이지(md)에서 공용.
 * 색만으로 구분하지 않도록 글리프 + 라벨(useWashTypeLabel)을 항상 병기한다(접근성/색각).
 *
 * forceLight=true면 dark: 변형 없이 라이트 팔레트만 렌더한다 — 상세 페이지처럼
 * OS 다크모드여도 화이트로 통일하는 라이트 전용 화면에서 다크 pill이 뜨는 것을 막는다.
 */
export function CarwashTypeBadge({
  type,
  size = 'sm',
  forceLight = false,
}: {
  type: WashType;
  size?: 'sm' | 'md';
  forceLight?: boolean;
}) {
  const washTypeLabel = useWashTypeLabel();
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
      {washTypeLabel(type)}
    </span>
  );
}
