// 로그인 게이트 — "이 동작은 회원만" 지점을 한 곳으로 모은다.
//
// 왜 만들었나(실측 근거, 2026-08-25):
//   28일간 지도 진입 1,038명 중 로그인 화면까지 간 사람은 26명(2.5%)뿐이고,
//   그중 17명(65%)은 버튼도 안 누르고 이탈했다. 그런데 **어느 게이트가 사람을 돌려세웠는지
//   알 방법이 없었다** — signIn() 을 여기저기서 직접 부르고 있어 계측이 하나도 없었다.
//   게이트마다 이유를 남기면 "내 위치 때문인지 길찾기 때문인지"를 숫자로 가를 수 있다.
//
// 부수 효과로 로그인 화면이 **왜 로그인이 필요한지** 말할 수 있게 된다(why 쿼리).
// 지금은 어디서 왔든 같은 문구라, 처음 온 사람에게는 맥락이 없다.

import { track } from '@/lib/analytics';

/**
 * 로그인이 필요한 동작의 종류.
 * 로그인 화면의 안내 문구(messages: auth.signIn.why.*)와 1:1로 대응한다.
 * 값을 추가하면 4개 로케일 문구도 함께 추가해야 한다(i18n:check 가 잡아준다).
 */
export type AuthGateReason =
  | 'location'   // 내 위치 / 따라가기
  | 'navi'       // 길안내 시작
  | 'favorite'   // 즐겨찾기
  | 'fuelLog'    // 주유·충전 기록
  | 'review'     // 리뷰 작성
  | 'report'     // 정보 제보
  | 'forecast'   // 주유 타이밍(블러 해제)
  | 'carwash'    // 세차 지수(블러 해제)
  | 'premium';   // 광고 제거 결제

export const AUTH_GATE_REASONS: readonly AuthGateReason[] = [
  'location', 'navi', 'favorite', 'fuelLog', 'review', 'report', 'forecast', 'carwash', 'premium',
] as const;

export function isAuthGateReason(v: string | null | undefined): v is AuthGateReason {
  return !!v && (AUTH_GATE_REASONS as readonly string[]).includes(v);
}

/** 로그인 화면에 사유를 전달하는 쿼리 키. */
export const AUTH_REASON_PARAM = 'why';

/** 커스텀 로그인 페이지 경로 — lib/auth/options.ts 의 pages.signIn 과 같아야 한다. */
const SIGN_IN_PATH = '/auth/sign-in';

/**
 * 로그인 화면으로 보낸다 — 계측 + 사유 전달을 함께 처리한다.
 *
 * ⚠️ signIn() 을 직접 부르지 말고 항상 이걸 쓴다. 직접 부르면 그 게이트만 계측에서 사라져
 *    "어디서 이탈하는가" 집계가 조용히 틀어진다.
 *
 * next-auth 의 signIn(undefined, …) 을 쓰지 않는 이유: 그 API 는 로그인 URL 에 우리 쿼리를
 * 붙일 방법이 없다. 어차피 목적지가 우리 커스텀 페이지(pages.signIn)라 직접 이동이 더 단순하다.
 *
 * @param reason      무엇을 하려다 막혔는지(로그인 화면 문구 + 계측 props)
 * @param callbackUrl 로그인 후 돌아올 곳. 기본은 현재 경로(+쿼리).
 */
export function requireLogin(reason: AuthGateReason, callbackUrl?: string): void {
  track('auth_gate', { reason });
  if (typeof window === 'undefined') return;
  const back = callbackUrl ?? `${window.location.pathname}${window.location.search}`;
  const qs = new URLSearchParams({ callbackUrl: back, [AUTH_REASON_PARAM]: reason });
  // replace 가 아니라 assign: 뒤로가기로 원래 화면에 돌아갈 수 있어야 한다
  // (로그인할 마음이 없던 사용자를 앱 밖으로 밀어내지 않는다).
  window.location.assign(`${SIGN_IN_PATH}?${qs}`);
}
