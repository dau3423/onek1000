'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';

// 노출 1회 판정용 localStorage 키. 문구/혜택을 크게 바꿔 다시 띄우고 싶으면
// 버전 숫자만 올리면 된다. 컴팩트 팝업으로 개편하며 V3 → V4 (기존에 본 사용자에게도 1회 재노출).
const SEEN_KEY = 'welcomePromoSeenV4';
const ENABLED = true;

// 공지 내용(정적). 추후 변경/관리 UI는 범위 밖 — 여기 상수만 고치면 된다.
// 혜택은 모두 실제 구현된 기능만 기재(과장 금지). 이모지 + 짧은 문구로 컴팩트하게.
const PROMO = {
  badge: '신규 가입 한정',
  // 헤드라인: 숫자/무료를 크게 강조하기 위해 줄을 나눠 둔다(렌더에서 highlight를 키움).
  title: '가입하면',
  highlight: '1주일 프리미엄 무료!',
  // 핵심 혜택만 3개. 짧은 라벨 + 이모지.
  benefits: [
    { icon: '🚫', text: '광고 OFF' },
    { icon: '⛽', text: '전국·내 주변 최저가' },
    { icon: '🗺️', text: '가는 길 최저가' },
    { icon: '🔔', text: '가격 하락 알림' },
  ],
  // 짧은 후킹 1줄(사실 기반: 카드 등록 없이 7일 무료 체험 제공 중).
  hook: '카드 등록 없이 바로 시작',
  cta: '🎁 1주일 무료로 받기',
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${PROMO.title} ${PROMO.highlight}`}
      onClick={close}
    >
      {/* 컴팩트 팝업 카드: 화면을 꽉 채우지 않게 중앙 정렬 + 좁은 폭, 높이는 내용에 맞춰 auto */}
      <div
        className="relative w-full max-w-[340px] rounded-2xl bg-white p-6 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          aria-label="닫기"
          className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {/* 헤드라인 — 숫자/무료를 크고 굵게 강조 */}
        <div className="text-center">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary dark:bg-primary/20">
            {PROMO.badge}
          </span>
          <p className="mt-3 text-base font-bold text-gray-700 dark:text-gray-200">{PROMO.title}</p>
          <h2 className="mt-0.5 text-2xl font-extrabold leading-tight text-primary">
            {PROMO.highlight}
          </h2>
        </div>

        {/* 핵심 혜택 3~4개 (스크롤 없이 한 화면) */}
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {PROMO.benefits.map((b) => (
            <li
              key={b.text}
              className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-sm font-semibold text-gray-800 dark:bg-gray-800 dark:text-gray-100"
            >
              <span aria-hidden className="text-base leading-none">
                {b.icon}
              </span>
              <span className="leading-tight">{b.text}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
          {PROMO.hook}
        </p>

        {/* CTA — 크고 눈에 띄게 */}
        <button
          onClick={handleSignUp}
          className="mt-4 w-full rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-sm hover:bg-primary-dark"
        >
          {PROMO.cta}
        </button>
        <button
          onClick={close}
          className="mt-1.5 w-full rounded-xl px-4 py-2 text-xs font-medium text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          다시 보지 않기
        </button>
      </div>
    </div>
  );
}
