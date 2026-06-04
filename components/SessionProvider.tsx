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
  // refetchInterval=10초: 1계정 1세션(중복 로그인) 무효화를 "수 초 이내"로 당기기 위해
  // 짧게 둔다. 매 재검증 시 jwt 콜백이 session_id를 가볍게 확인(약 3초 서버 캐시)하므로
  // 활성 탭은 최대 ~10초 내 무효화된다.
  // refetchOnWindowFocus: 다른 작업하다 기존 기기 탭으로 돌아오면 즉시 재검증→로그아웃.
  // 과도호출 방지: isPremium/구독 DB 조회는 jwt 콜백의 60초 캐시(PREMIUM_CACHE_MS)가
  // 그대로 살아 있어 사용자당 최대 60초에 1회만 조회된다(검증과 분리됨).
  return (
    <NASessionProvider refetchInterval={10} refetchOnWindowFocus>
      {children}
    </NASessionProvider>
  );
}
