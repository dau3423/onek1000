'use client';

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  copyCurrentUrl,
  getInAppKind,
  getPlatform,
  openExternalBrowser,
  type InAppKind,
} from '@/lib/inapp';
import { BETA_FREE } from '@/lib/flags';
import { track } from '@/lib/analytics';
import { AUTH_REASON_PARAM, isAuthGateReason } from '@/lib/auth/gate';

const boldTag = { b: (chunks: React.ReactNode) => <b>{chunks}</b> };

/** 복귀 URL 에 소셜 로그인 성공 표식을 붙인다(상대/절대 경로 모두 안전하게 처리). */
function withLoginMark(url: string, provider: string): string {
  try {
    const base = typeof window === 'undefined' ? 'https://onek1000.kr' : window.location.origin;
    const u = new URL(url, base);
    u.searchParams.set('signedin', provider);
    // 같은 오리진이면 경로만 돌려준다(오픈 리다이렉트 여지를 만들지 않는다).
    return u.origin === base ? `${u.pathname}${u.search}${u.hash}` : url;
  } catch {
    return url;
  }
}

function SignInInner() {
  const t = useTranslations('auth');
  const tSignIn = useTranslations('auth.signIn');
  const tCommon = useTranslations('common');
  const params = useSearchParams();
  const router = useRouter();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  // 중복 로그인(다른 기기에서 새 로그인)으로 밀려나 강제 로그아웃된 경우 안내.
  const duplicateNotice = params.get('reason') === 'duplicate';
  // 소셜 로그인 실패 코드. NextAuth 는 실패 시 이 페이지로 ?error=... 를 달아 되돌린다
  // (pages.error 미설정 → /api/auth/error 가 여기로 리다이렉트). 예전엔 이 값을 아무도 읽지
  // 않아서, 사용자는 아무 메시지 없는 깨끗한 로그인 화면을 다시 보고 같은 버튼을 계속 눌렀다.
  // 실측(전 기간): 한 기기가 구글 로그인을 12회 이상 반복 시도하고 끝내 가입하지 못했다.
  const oauthError = params.get('error');
  // 무엇을 하려다 막혀서 왔는지(lib/auth/gate.ts). 이 값이 있으면 제목을 그 맥락으로 바꾼다.
  // 실측: 로그인 화면까지 온 26명 중 17명(65%)이 버튼도 안 누르고 이탈했는데, 화면이 어디서
  // 왔든 같은 문구라 "왜 로그인해야 하는지"가 사용자에게 연결되지 않았다.
  const whyParam = params.get(AUTH_REASON_PARAM);
  const why = isAuthGateReason(whyParam) ? whyParam : null;

  // 이메일 로그인/회원가입 폼 상태. mode로 로그인↔가입을 전환한다.
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(''); // 회원가입 시 비밀번호 확인용
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 인앱 웹뷰(카톡/인스타 등) 감지 — UA는 클라이언트에서만 확정되므로 마운트 후 설정한다.
  const [inAppKind, setInAppKind] = useState<InAppKind | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    setInAppKind(getInAppKind());
    setIsIos(getPlatform() === 'ios');
    // 퍼널 최상단: 로그인 화면 도달. (방문 → 로그인화면 전환율의 기준점)
    track('signin_view', why ? { why } : undefined);
    // 왜 여기서 실패를 기록하나: 소셜 로그인 실패는 "가입 시도 후 이탈"로만 보여서
    // 원인을 알 수 없었다. 코드를 남겨야 OAuthCallback(콜백 실패)인지
    // AccessDenied(동의 거부)인지 Configuration(설정 오류)인지 구분된다.
    if (oauthError) track('auth_error', { code: oauthError });
    if (duplicateNotice) track('session_revoked');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInApp = inAppKind !== null;

  async function handleOpenExternal() {
    // best-effort 자동 외부 열기: 스킴/intent가 먹히는 환경(카톡/일부 안드)에선 즉시 전환된다.
    openExternalBrowser();
    // 자동 전환이 조용히 무시되는 웹뷰(당근 등)에서도 버튼이 죽지 않도록,
    // 결과와 무관하게 항상 수동 안내 패널을 띄우고 링크를 자동 복사한다.
    // (자동 전환이 성공하면 이미 페이지를 떠나므로 아래 상태 변경은 부작용이 없다.)
    setShowManual(true);
    const ok = await copyCurrentUrl();
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyUrl() {
    const ok = await copyCurrentUrl();
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  // 인앱 웹뷰에서 OAuth(카카오/구글) 시도 시: 바로 OAuth를 태우지 않고 외부 열기를 유도한다.
  // (구글은 disallowed_useragent로 차단, 카카오도 깨질 수 있어 가입 실패를 막는다.)
  function handleOAuth(provider: 'kakao' | 'google') {
    // 소셜 가입 시도. 인앱 웹뷰면 OAuth 대신 외부 열기를 유도하므로 그 분기도 함께 기록한다.
    track('oauth_click', { provider, inApp: isInApp });
    if (isInApp) {
      handleOpenExternal();
      return;
    }
    // 성공 여부를 알 수 있게 복귀 URL 에 표식을 붙인다. 지금까지 auth_success 는 이메일
    // 경로에서만 기록돼, 소셜은 "성공했는데 조용한 것"과 "실패한 것"을 구분할 수 없었다.
    // 표식은 복귀 화면이 1회 소비하고 주소창에서 지운다(forecast=1 과 같은 방식).
    signIn(provider, { callbackUrl: withLoginMark(callbackUrl, provider) });
  }

  // 이메일 자격증명으로 로그인 → 성공 시 callbackUrl로 이동.
  async function loginWithCredentials(): Promise<boolean> {
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl });
    if (res?.error || !res?.ok) {
      setError(tSignIn('invalidCredentials'));
      return false;
    }
    return true;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError(tSignIn('missingFields'));
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      setError(t('passwordMismatch'));
      return;
    }
    setSubmitting(true);
    // 이메일 로그인/가입 시도(실제 제출 시점). 가입 시도 대비 성공률을 본다.
    track('email_submit', { mode });
    try {
      if (mode === 'signup') {
        // 1) 회원가입(이메일 인증 없음) → 2) 곧바로 같은 자격증명으로 자동 로그인.
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? tSignIn('signupError'));
          return;
        }
        track('signup_success');
      }
      const ok = await loginWithCredentials();
      if (ok) {
        track('auth_success', { method: 'email', mode });
        router.push(callbackUrl);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <Image
        src="/icons/app_icon.png"
        alt={tCommon('appName')}
        width={64}
        height={64}
        className="rounded-2xl"
        priority
      />
      <h1 className="mt-4 text-xl font-bold text-gray-900">{tCommon('appName')}</h1>
      {/* 사유가 있으면 그것을 먼저 말한다 — "무엇을 하려다 왔는지"가 로그인 이유가 된다. */}
      <p className="mt-1 text-center text-sm text-gray-500">
        {why ? tSignIn(`why.${why}` as 'why.navi') : tSignIn('tagline')}
      </p>

      {/* 가입 혜택 한 줄 — 외부 브라우저 유도/소셜 버튼과 함께 가입 동기를 살짝 보강. */}
      {/* [베타 전면무료] 베타엔 광고 제거 포함 전 기능 무료 가치를 전면에 내세운다. 플래그 off 시 기존 카피로 원복. */}
      <p className="mt-2 text-center text-[12px] text-gray-400">
        {BETA_FREE ? tSignIn('benefitBeta') : tSignIn('benefitFull')}
      </p>

      {isInApp && (
        <div className="mt-6 w-full rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-[13px] font-bold text-orange-900">
            {tSignIn('inAppNotice', { kind: inAppKind ?? 'unknown' })}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-orange-800">
            {tSignIn.rich('inAppGuideDefault', boldTag)}
          </p>

          <button
            onClick={handleOpenExternal}
            className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600"
          >
            {tSignIn('openExternalButton')}
          </button>

          {/* iOS는 강제 외부 열기가 막혀 있어 수동 안내를, 그 외도 폴백으로 복사를 제공. */}
          {(showManual || isIos) && (
            <div className="mt-3 rounded-xl bg-white/70 p-3 text-[12px] leading-relaxed text-orange-800">
              {isIos ? (
                <p>{tSignIn.rich('iosManualGuide', boldTag)}</p>
              ) : (
                <p>{tSignIn.rich('androidManualGuide', boldTag)}</p>
              )}
              <button
                onClick={handleCopyUrl}
                className="mt-2 w-full rounded-lg border border-orange-300 bg-white py-2 text-[12px] font-semibold text-orange-700 hover:bg-orange-50"
              >
                {copied ? tSignIn('linkCopied') : tSignIn('copyLinkButton')}
              </button>
            </div>
          )}
        </div>
      )}

      {oauthError && (
        <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-600 dark:bg-red-950 dark:text-red-300">
          {tSignIn(`oauthError.${['AccessDenied', 'OAuthAccountNotLinked', 'Configuration'].includes(oauthError) ? oauthError : 'default'}`)}
        </p>
      )}
      {duplicateNotice && (
        <div className="mt-6 w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {tSignIn('duplicateNotice')}
        </div>
      )}

      <div className="mt-8 w-full space-y-2">
        <button
          onClick={() => handleOAuth('kakao')}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3.5 font-bold text-[#191919] hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/kakao.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          {tSignIn('kakaoStart')}
        </button>
        <button
          onClick={() => handleOAuth('google')}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3.5 font-semibold text-gray-700 hover:bg-gray-50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/google.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          {tSignIn('googleStart')}
        </button>
      </div>

      {/* 이메일 로그인/회원가입 — 인앱 웹뷰(OAuth 차단 환경)에서도 가입할 수 있도록 항상 노출한다. */}
      <div className="mt-6 w-full">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] text-gray-400">{tSignIn('orEmailDivider')}</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <form onSubmit={handleEmailSubmit} className="mt-3 space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? tSignIn('passwordPlaceholderSignup') : tSignIn('passwordPlaceholderLogin')}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
          {mode === 'signup' && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={tSignIn('confirmPasswordPlaceholder')}
              autoComplete="new-password"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
            />
          )}
          {error && <p className="text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {submitting
              ? mode === 'signup' ? tSignIn('submittingSignup') : tSignIn('submittingLogin')
              : mode === 'signup' ? tSignIn('submitSignup') : tSignIn('submitLogin')}
          </button>
        </form>
        {mode === 'login' && (
          <p className="mt-2 text-center text-[12px]">
            <Link href="/auth/forgot-password" className="text-gray-400 underline hover:text-gray-600">
              {tSignIn('forgotPasswordLink')}
            </Link>
          </p>
        )}
        <p className="mt-3 text-center text-[12px] text-gray-500">
          {mode === 'signup' ? tSignIn('toggleToLoginPrompt') : tSignIn('toggleToSignupPrompt')}
          <button
            type="button"
            onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setConfirm(''); }}
            className="font-semibold text-orange-600 underline"
          >
            {mode === 'signup' ? tSignIn('toggleToLoginAction') : tSignIn('toggleToSignupAction')}
          </button>
        </p>
      </div>

      {/* [베타 전면무료] 베타엔 결제 신호를 낮춘다: 결제약관 링크는 보존하되 강조를 빼고
          무료 가치 중심 문구로 톤다운한다(링크 삭제 아님). 플래그 off 시 기존 강조 문구로 원복. */}
      {BETA_FREE ? (
        <p className="mt-8 text-center text-[11px] text-gray-400">
          {tSignIn.rich('consentBeta', {
            terms: (chunks) => <Link href="/legal/terms" className="underline">{chunks}</Link>,
            privacy: (chunks) => <Link href="/legal/privacy" className="underline">{chunks}</Link>,
            payment: (chunks) => <Link href="/legal/payment" className="text-gray-300 underline">{chunks}</Link>,
          })}
        </p>
      ) : (
        <p className="mt-8 text-center text-[11px] text-gray-400">
          {tSignIn.rich('consentFull', {
            terms: (chunks) => <Link href="/legal/terms" className="underline">{chunks}</Link>,
            privacy: (chunks) => <Link href="/legal/privacy" className="underline">{chunks}</Link>,
            payment: (chunks) => <Link href="/legal/payment" className="underline">{chunks}</Link>,
          })}
        </p>
      )}

      <a
        href="http://pf.kakao.com/_dcnGX/chat"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 text-center text-[12px] text-gray-500 underline hover:text-gray-700"
      >
        {tSignIn('contactLabel')}
      </a>
    </main>
  );
}

export default function SignInClient() {
  const t = useTranslations('auth');
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-gray-500">{t('loadingFallback')}</div>}>
      <SignInInner />
    </Suspense>
  );
}
