'use client';

// 소셜 로그인 성공을 1회 계측한다.
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
// 레이아웃에 두는 이유: 복귀 지점은 홈만이 아니라 상세·즐겨찾기 등 어디든 될 수 있다.

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics';

const ALLOWED_PROVIDERS = new Set(['google', 'kakao']);

export function LoginResultTracker() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const sp = new URLSearchParams(window.location.search);
    const provider = sp.get('signedin');
    if (!provider) return;
    done.current = true;

    // 값 검증: 주소창으로 아무 문자열이나 들어올 수 있으므로 우리가 쓰는 값만 기록한다.
    if (ALLOWED_PROVIDERS.has(provider)) {
      track('auth_success', { method: provider, mode: 'oauth' });
    }

    // 표식 제거 — 나머지 쿼리는 보존한다(복귀 URL 이 자체 파라미터를 가질 수 있다).
    sp.delete('signedin');
    const qs = sp.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    );
  }, []);

  return null;
}

export default LoginResultTracker;
