'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getFirebaseAnalytics } from '@/lib/firebase/client';

// Next.js App Router에서 페이지 전환 시 분석 이벤트 전송
export function FirebaseAnalytics() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const analytics = await getFirebaseAnalytics();
        if (!analytics || cancelled) return;
        const { logEvent } = await import('firebase/analytics');
        const url = pathname + (params.toString() ? `?${params}` : '');
        logEvent(analytics, 'page_view', {
          page_path: pathname,
          page_location: typeof window !== 'undefined' ? window.location.href : url,
        });
      } catch {
        /* 분석 실패는 무시 */
      }
    })();
    return () => { cancelled = true; };
  }, [pathname, params]);

  return null;
}
