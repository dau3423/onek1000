'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';

// 노출 1회 판정용 localStorage 키. 문구/혜택을 크게 바꿔 다시 띄우고 싶으면
// 버전 숫자만 올리면 된다(예: V2). 비활성화하려면 ENABLED를 false로.
const SEEN_KEY = 'welcomePromoSeenV1';
const ENABLED = true;

// 공지 내용(정적). 추후 변경/관리 UI는 범위 밖 — 여기 상수만 고치면 된다.
const PROMO = {
  title: '회원가입만 해도 1달간 프리미엄 혜택 무료!',
  desc: '지금 가입하면 한 달 동안 프리미엄 기능을 무료로 누릴 수 있어요.',
  benefits: ['광고 완전 제거', '즐겨찾기 동기화', '가격 변동 푸시 알림'],
  cta: '회원가입하고 1달 무료 받기',
} as const;

/**
 * 메인 첫 접속 공지 모달 (회원가입 유도).
 * - 노출 조건: 비로그인 사용자에게만, 디바이스당 1회(localStorage 플래그).
 *   로그인 사용자/이미 본 사용자/세션 확인 중에는 뜨지 않는다.
 * - "다시 보지 않기"(=닫기) 시 플래그 저장 → 같은 기기에서 재노출 안 함.
 * - CTA: 기존 인증 유도 패턴 signIn(undefined,{callbackUrl:'/'}) 재사용
 *   (인앱 브라우저면 sign-in 페이지의 외부열기 안내가 그대로 동작).
 * - SSR 안전: localStorage는 클라이언트 effect에서만 접근. 마운트 후 판단해 깜빡임 방지.
 */
export function WelcomePromo() {
  const { status } = useSession();
  // 마운트 전/판단 전에는 닫힘으로 둬 SSR-CSR 깜빡임을 방지한다.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ENABLED) return;
    // 로그인 사용자에겐 안 띄움. 세션 확인 중(loading)에도 보류해 오노출을 막는다.
    if (status !== 'unauthenticated') return;
    try {
      if (localStorage.getItem(SEEN_KEY) === '1') return;
    } catch {
      // 프라이빗 모드 등 localStorage 접근 불가: 노출은 하되 닫기만 세션 한정.
    }
    setOpen(true);
  }, [status]);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function persistSeen() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* noop */
    }
  }

  function close() {
    persistSeen();
    setOpen(false);
  }

  function handleSignUp() {
    persistSeen();
    setOpen(false);
    signIn(undefined, { callbackUrl: '/' });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={PROMO.title}
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-900 sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold leading-snug text-gray-900 dark:text-gray-50">
            {PROMO.title}
          </h2>
          <button
            onClick={close}
            aria-label="닫기"
            className="-mr-1 shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{PROMO.desc}</p>

        <ul className="mt-4 space-y-2 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
          {PROMO.benefits.map((b) => (
            <li key={b} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
              <span className="text-primary" aria-hidden>
                ✓
              </span>
              {b}
            </li>
          ))}
        </ul>

        <button
          onClick={handleSignUp}
          className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-dark"
        >
          {PROMO.cta}
        </button>
        <button
          onClick={close}
          className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          다시 보지 않기
        </button>
      </div>
    </div>
  );
}
