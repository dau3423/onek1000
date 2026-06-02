// 로그인 페이지(서버 컴포넌트) — 심사용 로그인 폼 노출 여부만 서버에서 판단해 전달.
// REVIEWER_EMAIL/PASSWORD env 값 자체는 절대 클라이언트로 내려보내지 않는다(boolean만 전달).

import { isReviewerLoginEnabled } from '@/lib/auth/options';
import SignInClient from './SignInClient';

// 런타임 env(REVIEWER_*)에 따라 폼 노출이 갈리므로 동적 렌더링으로 평가한다.
export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return <SignInClient reviewerLoginEnabled={isReviewerLoginEnabled()} />;
}
