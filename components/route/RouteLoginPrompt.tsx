'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMapStore } from '@/stores/map';

// "경로 위 최저가 찾기"로 지도에 진입했음을 알리는 sessionStorage 플래그 키.
// route 페이지(search)가 비회원으로 진입할 때 세우고, 지도 화면 마운트 시 소비한다.
export const ROUTE_ENTRY_FLAG = 'routeEntryFromCheapest';

// "로그인 화면으로 보냈고, 아직 로그인 결과를 기다린다"는 게이트 대기 플래그 키.
// 확인(=로그인) 버튼을 눌러 /auth/sign-in으로 보낼 때 세운다. 사용자가 로그인하지 않고
// 뒤로가기로 지도(/)에 돌아오면 이 플래그가 남아 있으므로, 팝업을 다시 띄우지 않고
// 경로 찾기를 해제(clearRoutePlan)해 일반 지도로 되돌린다(무료 우회 차단).
const ROUTE_LOGIN_GATE_PENDING = 'routeLoginGatePending';

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
 * - 확인 시 게이트 대기 플래그를 세우고 로그인 화면(/auth/sign-in)으로 이동한다.
 *
 * 백 내비게이션 구멍 막기:
 *   확인 → 로그인 화면 → 뒤로가기로 지도 복귀 시, ROUTE_ENTRY_FLAG는 이미 소비돼 팝업이
 *   다시 안 떠 비회원이 경로 최저가를 계속 무료로 보던 문제가 있었다.
 *   → 로그인 화면으로 보낼 때 ROUTE_LOGIN_GATE_PENDING을 세우고, 마운트 시 이 플래그가
 *     남아 있으면(= 로그인 안 하고 돌아옴) 경로 찾기를 해제(clearRoutePlan)해 일반 지도로 되돌린다.
 *     로그인에 성공한 경우(authenticated)에는 플래그만 정리하고 경로를 보존한다.
 */
export function RouteLoginPrompt() {
  const router = useRouter();
  const { status } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 세션 확인 중(loading)에는 보류한다 — 플래그 조기 소비/오노출을 막고,
    // loading → authenticated 순서에서 unauthenticated 분기를 잘못 타지 않게 한다.
    if (status === 'loading') return;

    // 로그인에 성공한 사용자: 게이트 대기 플래그만 정리하고 팝업을 띄우지 않는다(경로 보존).
    if (status === 'authenticated') {
      try {
        window.sessionStorage.removeItem(ROUTE_LOGIN_GATE_PENDING);
      } catch {
        /* 프라이빗 모드 등 sessionStorage 접근 불가: 무시 */
      }
      return;
    }

    // 이하 status === 'unauthenticated'.
    // 1) 게이트 대기 플래그가 남아 있으면 = 로그인 화면에서 로그인하지 않고 뒤로가기로 돌아온 것.
    //    → 플래그 제거 + 경로 찾기 해제(일반 지도로 복귀) + 팝업 미노출.
    try {
      if (window.sessionStorage.getItem(ROUTE_LOGIN_GATE_PENDING) === '1') {
        window.sessionStorage.removeItem(ROUTE_LOGIN_GATE_PENDING);
        useMapStore.getState().clearRoutePlan();
        return;
      }
    } catch {
      // 프라이빗 모드 등 sessionStorage 접근 불가: 게이트 처리 생략(아래 진입 플래그 평가도 실패 시 return).
    }

    // 2) 정상 비회원 진입: ROUTE_ENTRY_FLAG를 소비하고, 있으면 5초 후 팝업을 띄운다.
    let flagged = false;
    try {
      flagged = window.sessionStorage.getItem(ROUTE_ENTRY_FLAG) === '1';
      // 진입 1회만 평가하도록 즉시 소비(새로고침/뒤로가기 재진입 시 재노출 방지).
      if (flagged) window.sessionStorage.removeItem(ROUTE_ENTRY_FLAG);
    } catch {
      // 프라이빗 모드 등 sessionStorage 접근 불가: 조용히 노출 안 함.
      return;
    }

    if (!flagged) return;

    const t = window.setTimeout(() => setOpen(true), PROMPT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  if (!open) return null;

  // 확인 = 로그인. 게이트 대기 플래그를 세운 뒤 로그인 화면으로 이동한다.
  // 사용자가 로그인하지 않고 뒤로가기로 돌아오면, 마운트 effect가 이 플래그를 보고 경로를 해제한다.
  function handleConfirm() {
    try {
      window.sessionStorage.setItem(ROUTE_LOGIN_GATE_PENDING, '1');
    } catch {
      /* 프라이빗 모드 등 sessionStorage 불가: 게이트 우회 방어가 약해질 뿐 로그인 이동엔 영향 없음 */
    }
    setOpen(false);
    router.push('/auth/sign-in');
  }

  // 바깥 터치/ESC로 닫지 않는다(유일한 출구는 확인=로그인 버튼). 접근성 마크업(role/aria)은 유지.
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="로그인 안내"
    >
      <div className="relative w-full max-w-[340px] rounded-2xl bg-white p-6 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-900">
        <p className="text-center text-lg font-bold leading-snug text-gray-900 dark:text-gray-50">
          로그인하고 모든 기능을
          <br />
          무료로 누려보세요
        </p>
        <p className="mt-2 text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          가입은 1초, 전 기능을 무료로 쓸 수 있어요.
        </p>

        <ul className="mt-5 space-y-2.5">
          <li className="flex items-start gap-2.5">
            <span aria-hidden className="mt-0.5 text-base leading-none">🛣️</span>
            <span className="text-sm font-medium leading-snug text-gray-800 dark:text-gray-200">
              경로 위 실시간 최저가 주유소
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden className="mt-0.5 text-base leading-none">🔔</span>
            <span className="text-sm font-medium leading-snug text-gray-800 dark:text-gray-200">
              가격 하락 알림 · 즐겨찾기
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden className="mt-0.5 text-base leading-none">⛽</span>
            <span className="text-sm font-medium leading-snug text-gray-800 dark:text-gray-200">
              내 주유 기록까지 전부 무료
            </span>
          </li>
        </ul>

        <button
          onClick={handleConfirm}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-sm hover:bg-primary-dark"
        >
          확인
        </button>
      </div>
    </div>
  );
}
