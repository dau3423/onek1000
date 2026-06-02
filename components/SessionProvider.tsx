'use client';

import { SessionProvider as NASessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export function SessionProvider({ children }: { children: ReactNode }) {
  // 클라이언트 세션(JWT) 재검증 정책.
  // JWT 전략에서 useSession()의 isPremium/subStatus는 로그인 시점 쿠키 값에 고정되어,
  // 결제로 구독이 active가 돼도 클라가 /api/auth/session을 다시 호출하지 않으면 옛 값(false)이 계속 쓰인다.
  // (헤더 아이콘·광고 노출 OFF·푸시 버튼 등 모든 클라 isPremium 분기가 영향)
  // → 주기 재검증 + 포커스 복귀 시 재검증으로 "재로그인 없이" 최신 구독 상태가 반영되게 한다.
  //
  // 과도호출 방지: 세션 재요청이 자주 와도 jwt 콜백의 60초 캐시(PREMIUM_CACHE_MS)가
  // 살아 있어 DB(subscriptions)는 사용자당 최대 60초에 1회만 조회된다.
  // refetchInterval(초)은 캐시 주기와 맞춰 불필요한 요청을 줄인다.
  return (
    <NASessionProvider refetchInterval={60} refetchOnWindowFocus>
      {children}
    </NASessionProvider>
  );
}
