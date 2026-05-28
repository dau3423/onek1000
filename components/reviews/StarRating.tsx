'use client';

// 별점 컴포넌트
// 표시 전용: <StarRating value={4.3} readOnly />
// 입력용:   <StarRating value={rating} onChange={setRating} />

import clsx from 'clsx';

interface Props {
  value: number;            // 0~5 (소수 가능 — readOnly 모드에서만)
  onChange?: (v: 1 | 2 | 3 | 4 | 5) => void;
  size?: 'sm' | 'md' | 'lg';
  readOnly?: boolean;
}

const SIZES = { sm: 'text-base', md: 'text-2xl', lg: 'text-4xl' };

export function StarRating({ value, onChange, size = 'md', readOnly = false }: Props) {
  return (
    <div className={clsx('inline-flex items-center gap-0.5 leading-none', SIZES[size])}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n;
        const half = !filled && value >= n - 0.5;
        const symbol = filled ? '★' : half ? '★' : '☆';
        return (
          <button
            key={n}
            type="button"
            onClick={() => !readOnly && onChange?.(n as 1 | 2 | 3 | 4 | 5)}
            disabled={readOnly}
            aria-label={`${n}점`}
            className={clsx(
              'transition',
              !readOnly && 'cursor-pointer hover:scale-110',
              readOnly && 'cursor-default',
              filled ? 'text-primary' : half ? 'text-primary/60' : 'text-gray-300',
            )}
          >
            {symbol}
          </button>
        );
      })}
    </div>
  );
}
