'use client';

// 중복 로그인 감시(1계정 1세션, last-login-wins).
// 다른 기기/브라우저에서 더 나중에 로그인하면, 이전 기기의 세션은 서버 검증에서
// 무효화되어 session.revoked === true 로 내려온다(see lib/auth/options.ts).
// 그 시점에 즉시 강제 로그아웃하고 로그인 페이지로 보내, 기존 인증 유도 흐름에 합류시킨다.
//
// 감지 시점: SessionProvider의 주기 재검증(refetchInterval=10s) + 창 포커스 복귀 +
// 아래 visibilitychange(백그라운드→포그라운드 복귀) 시 update()로 즉시 재검증되며,
// /api/auth/session이 재호출되어 revoked 표식이 반영된다.
import { useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';

export function SessionGuard() {
  const { data: session, status, update } = useSession();
  // signOut이 reload를 유발하기 전에 중복 호출되지 않도록 1회로 가드.
  const firing = useRef(false);

  // 백그라운드/유휴 탭이 다시 포그라운드로 돌아오는 순간 즉시 세션 재검증.
  // refetchOnWindowFocus가 탭 전환을 못 잡는 모바일/일부 브라우저 케이스를 보완해,
  // 복귀 직후 중복 로그인 무효화를 거의 즉시 트리거한다(refetchInterval 대기 불필요).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && status === 'authenticated') {
        void update();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status, update]);

  useEffect(() => {
    if (!session?.revoked || firing.current) return;
    firing.current = true;
    // 강제 로그아웃 후 로그인 페이지로 이동(기존 인증 유도 흐름과 동일 목적지).
    void signOut({ callbackUrl: '/auth/sign-in?reason=duplicate' });
  }, [session?.revoked]);

  return null;
}
