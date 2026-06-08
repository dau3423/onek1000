'use client';

// 친구 추천(레퍼럴) 캡처 + 클레임 — 전역 마운트(루트 레이아웃).
//
// 동작:
//  1) URL의 ?ref=<code>를 쿠키(onek_ref, 30일)에 저장한다. OAuth 리다이렉트(카카오/구글)를
//     거쳐도 살아남게 쿠키를 쓴다. 저장 후 주소창에서 ref 쿼리는 깔끔히 제거한다.
//  2) 로그인 상태이고 ref 쿠키가 있으면 /api/referral/claim(POST)을 1회 호출한다.
//     서버가 검증/멱등/보상 처리 후 쿠키를 삭제하므로 클라는 결과를 신뢰하지 않아도 된다.
//     클레임 성공 시 useSession().update()로 세션(isPremium)을 즉시 갱신한다.
//
// SSR 안전: 모든 window/document 접근은 effect 안에서만. 실패해도 앱이 깨지지 않게 흡수.

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

const REF_COOKIE = 'onek_ref';
const REF_COOKIE_DAYS = 30;

/** 쿠키 읽기(SSR 안전). */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** 쿠키 쓰기(SameSite=Lax → OAuth 리다이렉트 복귀 시에도 유지). */
function writeCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  const maxAge = days * 86400;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function ReferralClaim() {
  const { status, update } = useSession();
  const claimed = useRef(false);

  // 1) URL ?ref= 캡처 → 쿠키 저장 + 주소창 정리.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get('ref');
      if (ref && /^[0-9A-Za-z]{4,16}$/.test(ref)) {
        // 이미 추천인이 확정된 사용자(쿠키 없음 + 로그인)는 굳이 덮어쓸 필요 없지만,
        // 여기선 단순히 쿠키만 저장한다(서버가 멱등/중복을 최종 판정).
        writeCookie(REF_COOKIE, ref, REF_COOKIE_DAYS);
        url.searchParams.delete('ref');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } catch {
      // URL 파싱/history 실패 무시
    }
  }, []);

  // 2) 로그인 + ref 쿠키 있으면 클레임 1회.
  useEffect(() => {
    if (status !== 'authenticated' || claimed.current) return;
    if (!readCookie(REF_COOKIE)) return;
    claimed.current = true;
    (async () => {
      try {
        const res = await fetch('/api/referral/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}', // 코드는 서버가 쿠키에서 읽음
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        // 보상 받았으면 세션 갱신 → isPremium 즉시 반영(jwt update 트리거).
        if (data?.ok) void update().catch(() => {});
      } catch {
        // 네트워크 실패 등 무시. 서버가 쿠키를 못 지웠으면 다음 진입에서 재시도된다.
      }
    })();
  }, [status, update]);

  return null;
}
