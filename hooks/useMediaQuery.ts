'use client';

import { useEffect, useState } from 'react';

/**
 * CSS 미디어쿼리 매칭 여부를 반환하는 훅.
 * SSR/첫 렌더에서는 항상 false를 반환하고, 클라이언트 마운트 후 실제 값으로 갱신한다.
 * → 서버에서 폭을 단정하지 않으므로 hydration mismatch가 발생하지 않는다.
 *
 * @example const isDesktop = useMediaQuery('(min-width: 1024px)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
