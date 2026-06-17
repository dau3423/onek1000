'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

// "경로 위 최저가 찾기"로 지도에 진입했음을 알리는 sessionStorage 플래그 키.
// route 페이지(search)가 비회원으로 진입할 때 세우고, 지도 화면 마운트 시 소비한다.
export const ROUTE_ENTRY_FLAG = 'routeEntryFromCheapest';

// 지도 진입 후 팝업을 띄우기까지의 지연(ms).
const PROMPT_DELAY_MS = 5000;

/**
 * 비회원이 "경로별 최저가 → 경로 위 최저가 찾기"로 지도에 진입했을 때,
 * 5초 뒤 로그인 유도 팝업을 띄운다.
 *
 * - 노출 조건: sessionStorage 플래그(ROUTE_ENTRY_FLAG)가 있고, 비로그인 사용자일 때만.
 *   로그인 사용자/세션 확인 중에는 띄우지 않는다.
 * - 플래그는 지도 마운트 시 즉시 소비(삭제)한다 → 새로고침/뒤로가기 재진입 시 오노출 방지.
 *   "경로 위 최저가 찾기"로 다시 진입하면 route 페이지가 플래그를 새로 세우므로 매번 동작한다.
 * - 5초 타이머는 마운트 시점 기준으로 시작하고 언마운트 시 clearTimeout으로 정리한다
 *   → 팝업 뜨기 전에 화면을 벗어나면 팝업이 뜨지 않는다.
 * - 확인 시 로그인 화면(/auth/sign-in)으로 이동한다.
 */
export function RouteLoginPrompt() {
  const router = useRouter();
  const { status } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 세션 확인 중(loading)에는 보류해 오노출/플래그 조기 소비를 막는다.
    if (status === 'loading') return;

    let flagged = false;
    try {
      flagged = window.sessionStorage.getItem(ROUTE_ENTRY_FLAG) === '1';
      // 진입 1회만 평가하도록 즉시 소비(새로고침/뒤로가기 재진입 시 재노출 방지).
      if (flagged) window.sessionStorage.removeItem(ROUTE_ENTRY_FLAG);
    } catch {
      // 프라이빗 모드 등 sessionStorage 접근 불가: 조용히 노출 안 함.
      return;
    }

    // 경로 진입 플래그가 없거나 로그인 사용자면 팝업을 띄우지 않는다.
    if (!flagged || status !== 'unauthenticated') return;

    const t = window.setTimeout(() => setOpen(true), PROMPT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  // ESC로 닫기(WelcomePromo와 동일 UX).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  function handleConfirm() {
    setOpen(false);
    router.push('/auth/sign-in');
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="로그인 안내"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-[340px] rounded-2xl bg-white p-6 pb-[calc(24px+env(safe-area-inset-bottom))] text-center shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold leading-relaxed text-gray-900 dark:text-gray-50">
          로그인후 모든기능을 사용해보세요
        </p>
        <button
          onClick={handleConfirm}
          className="mt-5 w-full rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-sm hover:bg-primary-dark"
        >
          확인
        </button>
      </div>
    </div>
  );
}
