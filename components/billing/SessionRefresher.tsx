'use client';

// 결제 성공 직후 세션(JWT)을 즉시 갱신해 프리미엄 상태(isPremium)를 반영한다.
// 기본적으로 isPremium은 60초 캐시라 결제 직후 광고 OFF 등 프리미엄 UI가 늦게 반영된다.
// useSession().update()를 1회 호출하면 jwt 'update' 트리거 → getPremiumStatus 재조회로 최신화된다.
import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

export function SessionRefresher() {
  const { update } = useSession();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return; // 중복 호출 방지
    done.current = true;
    // 실패해도 화면이 깨지지 않도록 에러는 무시(다음 캐시 만료 시 자연 갱신).
    void update().catch(() => {});
  }, [update]);

  return null;
}
