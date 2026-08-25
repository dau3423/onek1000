'use client';

// 비로그인 사용자에게 값만 가리는 잠금 래퍼.
//  - 자식을 블러 처리하고 그 위에 "로그인하고 확인" 오버레이 버튼을 덮는다.
//  - 오버레이 전체가 버튼이라 카드 어디를 눌러도 로그인 화면으로 간다(기존 signIn 관용구 재사용).
//
// 의도적으로 세션을 읽지 않는 순수 표시 컴포넌트다. 잠금 여부 판정은 호출부(카드)가 한다 —
// 카드가 "잠김이면 데이터를 아예 받아오지 않는다"까지 함께 결정해야 하기 때문이다.
// 블러는 CSS라 devtools로 걷어낼 수 있으므로, 실제 값을 DOM에 넣어두고 가리는 용도로는 쓰지 않는다.
//
// 접근성: 블러된 자식은 inert로 초점·클릭·접근성 트리에서 빼고(잠긴 값을 스크린리더가 읽거나
// 탭으로 들어가는 것 방지), 실제로 조작 가능한 것은 오버레이 버튼 하나뿐이다.
// inert 미지원 브라우저 대비로 pointer-events-none / aria-hidden 도 함께 건다.

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { requireLogin, type AuthGateReason } from '@/lib/auth/gate';
import { useTranslations } from 'next-intl';
import { LockIcon } from '@/components/icons';

interface Props {
  /** 무엇을 가렸는지 — 로그인 화면이 그 사유로 안내 문구를 바꾸고 계측에도 남는다. */
  reason: AuthGateReason;
  children: ReactNode;
  /** 로그인 후 돌아올 경로. 기본값은 현재 경로. */
  callbackUrl?: string;
}

export function LoginBlurGate({ children, callbackUrl, reason }: Props) {
  const t = useTranslations('auth.loginGate');
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement | null>(null);

  // inert 는 React 18 타입에 없어 속성으로 직접 건다(불리언 prop으로 넘기면 경고).
  useEffect(() => {
    contentRef.current?.setAttribute('inert', '');
  }, []);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        aria-hidden
        className="pointer-events-none select-none blur-[5px] saturate-50"
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => requireLogin(reason, callbackUrl ?? pathname ?? '/')}
        className="absolute inset-0 flex items-center justify-center rounded-xl"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-900/85 px-3.5 py-2 text-xs font-bold text-white shadow-lg backdrop-blur dark:bg-gray-100/90 dark:text-gray-900">
          <LockIcon className="h-3.5 w-3.5" />
          {t('cta')}
        </span>
      </button>
    </div>
  );
}

export default LoginBlurGate;
