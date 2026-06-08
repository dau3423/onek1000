'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';

// 노출 1회 판정용 localStorage 키. 문구/혜택을 크게 바꿔 다시 띄우고 싶으면
// 버전 숫자만 올리면 된다. 내용 대폭 개편으로 V1 → V2 (기존에 본 사용자에게도 1회 재노출).
const SEEN_KEY = 'welcomePromoSeenV2';
const ENABLED = true;

// 공지 내용(정적). 추후 변경/관리 UI는 범위 밖 — 여기 상수만 고치면 된다.
// 혜택은 모두 실제 구현된 기능만 기재(과장 금지). 이모지 + 짧은 문구로 컴팩트하게.
const PROMO = {
  badge: '신규 가입 한정',
  title: '기름값, 이제 아끼세요',
  highlight: '회원가입만 해도 1달간 모든 기능 제공!',
  desc: '전국 최저가부터 가는 길 최저가, 가격 하락 알림까지 — 가입 즉시 누리세요.',
  benefits: [
    '✅ 가입 즉시 1달 프리미엄 혜택 — 광고 없이 쾌적하게',
    '⛽ 전국 주유소 최저가 한눈에',
    '📍 내 주변 최저가 TOP10',
    '🗺️ 경로 탐색 — 출발지~도착지 길찾기',
    '💸 가는 길 위 최저가 주유소까지 탐색',
    '🛣️ 고속도로 휴게소 주유소 가격',
    '🔔 즐겨찾기 주유소 가격 하락 알림',
    '🧾 내 주유 기록 자동 관리',
  ],
  outro: '카드 등록 없이 바로 시작 — 지금 1달 무료로 체험해 보세요.',
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
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900 sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더(고정) */}
        <div className="relative shrink-0 px-5 pt-5">
          <button
            onClick={close}
            aria-label="닫기"
            className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary dark:bg-primary/20">
            {PROMO.badge}
          </span>
          <h2 className="mt-2 pr-8 text-xl font-extrabold leading-tight text-gray-900 dark:text-gray-50">
            {PROMO.title}
          </h2>
          <p className="mt-1 text-base font-bold leading-snug text-primary">{PROMO.highlight}</p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{PROMO.desc}</p>
        </div>

        {/* 혜택 목록(내부 스크롤) */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ul className="space-y-2 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
            {PROMO.benefits.map((b) => (
              <li
                key={b}
                className="flex items-start gap-1 text-sm leading-relaxed text-gray-800 dark:text-gray-100"
              >
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
            {PROMO.outro}
          </p>
        </div>

        {/* CTA(고정, safe-area) */}
        <div className="shrink-0 border-t border-gray-100 px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 dark:border-gray-800 sm:pb-4">
          <button
            onClick={handleSignUp}
            className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-sm hover:bg-primary-dark"
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
    </div>
  );
}
