'use client';

// 소셜 로그인 결과를 1회 계측한다.
//
// 왜 필요한가: auth_success 는 이메일 경로에서만 기록됐다. 소셜은 성공해도 아무 이벤트가 없어서,
// 데이터상 "로그인 화면 → 소셜 버튼 클릭 → 끝"으로만 보였다. 그래서 실패한 것인지 성공했는데
// 조용한 것인지 구분할 수 없었다 — 실제로 한 기기가 구글 로그인을 12회 넘게 반복 시도한 기록이
// 있는데도 원인 판별이 불가능했다.
//
// 방식: 로그인 화면이 복귀 URL 에 ?signedin=<provider> 를 붙여 보내고, 복귀한 화면에서
// 이 컴포넌트가 1회 소비한다. 계측 후 주소창에서 파라미터를 지워 새로고침·뒤로가기로
// 중복 발화하지 않게 한다(ForecastCard 의 forecast=1 과 같은 방식).
//
// ⚠️ 표식만으로 성공을 단정하지 않는다(2026-08-25 수정).
//   예전에는 URL 에 표식이 있으면 곧장 auth_success 를 찍었다. 그 값은 "OAuth 콜백이 돌아왔다"는
//   뜻일 뿐 **세션이 실제로 붙었는지는 확인하지 않는다**. 실측에서 auth_success 15건 중 13건이
//   그 뒤 로그인 화면으로 되돌아왔고(한 기기는 성공 4회 / 로그인화면 32회), 그 반복이 전부
//   '성공'으로 집계되고 있었다. 그래서 세션이 확정될 때까지 기다렸다가,
//     · 세션 있음 → auth_success
//     · 세션 없음 → auth_session_missing
//   으로 갈라 기록한다. 이래야 "로그인이 실제로 유지되는가"를 데이터로 판별할 수 있다.
//
// 레이아웃에 두는 이유: 복귀 지점은 홈만이 아니라 상세·즐겨찾기 등 어디든 될 수 있다.

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { track } from '@/lib/analytics';

const ALLOWED_PROVIDERS = new Set(['google', 'kakao']);

export function LoginResultTracker() {
  const { status } = useSession();
  const done = useRef(false);
  /** 표식을 읽어 둔 뒤 주소창에서는 즉시 지운다 — 판정은 세션 확정 후에 한다. */
  const provider = useRef<string | null>(null);
  const consumed = useRef(false);

  // 1단계: 표식 회수 + 주소창 정리. 세션 상태와 무관하게 마운트 직후 1회만.
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get('signedin');
    if (!p) return;
    // 값 검증: 주소창으로 아무 문자열이나 들어올 수 있으므로 우리가 쓰는 값만 기록한다.
    if (ALLOWED_PROVIDERS.has(p)) provider.current = p;

    // 표식 제거 — 나머지 쿼리는 보존한다(복귀 URL 이 자체 파라미터를 가질 수 있다).
    sp.delete('signedin');
    const qs = sp.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    );
  }, []);

  // 2단계: 세션이 확정된 뒤에 성공/실패를 가른다.
  // status 는 'loading' → 'authenticated' | 'unauthenticated' 로 정착한다.
  // loading 중에 판정하면 멀쩡한 로그인을 실패로 기록하게 된다(이 앱에서 반복해 겪은 함정).
  useEffect(() => {
    if (done.current || !provider.current) return;
    if (status === 'loading') return;
    done.current = true;
    if (status === 'authenticated') {
      track('auth_success', { method: provider.current, mode: 'oauth' });
    } else {
      // 콜백은 돌아왔는데 세션이 없다 = 로그인이 실제로는 완료되지 않았다.
      track('auth_session_missing', { method: provider.current });
    }
  }, [status]);

  return null;
}

export default LoginResultTracker;
