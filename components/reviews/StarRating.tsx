'use client';

// 별점 컴포넌트
// 표시 전용: <StarRating value={4.3} readOnly />
// 입력용:   <StarRating value={rating} onChange={setRating} />

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { StarFilledIcon, StarOutlineIcon } from '@/components/icons';

interface Props {
  value: number;            // 0~5 (소수 가능 — readOnly 모드에서만)
  onChange?: (v: 1 | 2 | 3 | 4 | 5) => void;
  size?: 'sm' | 'md' | 'lg';
  readOnly?: boolean;
}

// 별 크기 매핑(§3-1): sm→h-4, md→h-6, lg→h-9. 기존 SIZES(text-*)를 SVG 크기로 대체.
const STAR_SIZES = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-9 w-9' } as const;

// 3-상태 별 하나를 렌더. half는 오버레이 클리핑(바닥 빈 별 + 좌 50% 채운 별)으로 실제 반 채움.
// SVG defs clipPath/gradient 대신 CSS overflow-hidden 클리핑 사용(같은 화면 다수 렌더 시 id 충돌 회피).
function Star({ state, sizeCls }: { state: 'filled' | 'half' | 'empty'; sizeCls: string }) {
  if (state === 'filled') {
    return <StarFilledIcon className={clsx(sizeCls, 'text-primary')} />;
  }
  if (state === 'empty') {
    return <StarOutlineIcon className={clsx(sizeCls, 'text-gray-300 dark:text-gray-600')} />;
  }
  // half: 바닥 빈 별 위에 좌측 50%만 보이는 채운 별을 겹친다.
  return (
    <span className={clsx('relative inline-block', sizeCls)}>
      <StarOutlineIcon className={clsx(sizeCls, 'text-gray-300 dark:text-gray-600')} />
      <span className="absolute inset-0 w-1/2 overflow-hidden">
        <StarFilledIcon className={clsx(sizeCls, 'text-primary')} />
      </span>
    </span>
  );
}

export function StarRating({ value, onChange, size = 'md', readOnly = false }: Props) {
  const t = useTranslations('station.review');
  const sizeCls = STAR_SIZES[size];
  return (
    <div className="inline-flex items-center gap-0.5 leading-none">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n;
        const half = !filled && value >= n - 0.5;
        const state = filled ? 'filled' : half ? 'half' : 'empty';
        return (
          <button
            key={n}
            type="button"
            onClick={() => !readOnly && onChange?.(n as 1 | 2 | 3 | 4 | 5)}
            disabled={readOnly}
            aria-label={t('starLabel', { n })}
            className={clsx(
              'transition motion-reduce:transition-none',
              // 입력용 별은 p-1로 별 간 실탭 영역 확보(별 5개 가로 나열이라 44px 강제 시 폼 폭 초과 — 예외).
              !readOnly && 'cursor-pointer p-1 hover:scale-110',
              readOnly && 'cursor-default',
            )}
          >
            <Star state={state} sizeCls={sizeCls} />
          </button>
        );
      })}
    </div>
  );
}
