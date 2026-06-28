'use client';

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import {
  copyCurrentUrl,
  getInAppKind,
  getPlatform,
  inAppKindLabel,
  openExternalBrowser,
  type InAppKind,
} from '@/lib/inapp';
import { BETA_FREE } from '@/lib/flags';
import { track } from '@/lib/analytics';

function SignInInner() {
  const params = useSearchParams();
  const router = useRouter();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  // 중복 로그인(다른 기기에서 새 로그인)으로 밀려나 강제 로그아웃된 경우 안내.
  const duplicateNotice = params.get('reason') === 'duplicate';

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
    track('signin_view');
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
    signIn(provider, { callbackUrl });
  }

  // 이메일 자격증명으로 로그인 → 성공 시 callbackUrl로 이동.
  async function loginWithCredentials(): Promise<boolean> {
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl });
    if (res?.error || !res?.ok) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      return false;
    }
    return true;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      setError('비밀번호가 일치하지 않습니다.');
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
          setError(data?.error ?? '가입 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
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
        alt="1000냥 주유소"
        width={64}
        height={64}
        className="rounded-2xl"
        priority
      />
      <h1 className="mt-4 text-xl font-bold text-gray-900">1000냥 주유소</h1>
      <p className="mt-1 text-sm text-gray-500">소셜 계정으로 1초만에 시작</p>

      {/* 가입 혜택 한 줄 — 외부 브라우저 유도/소셜 버튼과 함께 가입 동기를 살짝 보강. */}
      {/* [베타 전면무료] 베타엔 광고 제거 포함 전 기능 무료 가치를 전면에 내세운다. 플래그 off 시 기존 카피로 원복. */}
      <p className="mt-2 text-center text-[12px] text-gray-400">
        {BETA_FREE
          ? '광고 없이 · 가격 하락 알림 · 즐겨찾기까지 전부 무료'
          : '가격 하락 알림 · 즐겨찾기 · 내 주유기록까지 무료'}
      </p>

      {isInApp && (
        <div className="mt-6 w-full rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-[13px] font-bold text-orange-900">
            {inAppKindLabel(inAppKind)} 앱에서 열렸어요
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-orange-800">
            원활한 가입·로그인을 위해 <b>Chrome / Safari 같은 외부 브라우저</b>에서
            열어주세요. (구글 로그인은 인앱 브라우저에서 차단됩니다.)
          </p>

          <button
            onClick={handleOpenExternal}
            className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600"
          >
            외부 브라우저로 열기
          </button>

          {/* iOS는 강제 외부 열기가 막혀 있어 수동 안내를, 그 외도 폴백으로 복사를 제공. */}
          {(showManual || isIos) && (
            <div className="mt-3 rounded-xl bg-white/70 p-3 text-[12px] leading-relaxed text-orange-800">
              {isIos ? (
                <p>
                  자동 전환이 안 되면 <b>우측 상단 메뉴(···) → &ldquo;Safari로 열기&rdquo;</b>를
                  눌러주세요. 또는 아래 버튼으로 링크를 복사해 브라우저 주소창에 붙여넣어도 됩니다.
                </p>
              ) : (
                <p>
                  이 화면이 보이면 <b>우측 상단(또는 하단)의 ⋮ / 공유 메뉴에서
                  &ldquo;다른 브라우저로 열기&rdquo;</b>를 누르거나, <b>복사된 링크를 Chrome /
                  Safari 주소창에 붙여넣어</b> 주세요.
                </p>
              )}
              <button
                onClick={handleCopyUrl}
                className="mt-2 w-full rounded-lg border border-orange-300 bg-white py-2 text-[12px] font-semibold text-orange-700 hover:bg-orange-50"
              >
                {copied ? '링크가 복사되었어요' : '현재 링크 복사하기'}
              </button>
            </div>
          )}
        </div>
      )}

      {duplicateNotice && (
        <div className="mt-6 w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          다른 기기에서 로그인되어 현재 기기는 로그아웃되었습니다. 계정당 1개의 기기에서만 사용할 수 있어요. 다시 로그인해 주세요.
        </div>
      )}

      <div className="mt-8 w-full space-y-2">
        <button
          onClick={() => handleOAuth('kakao')}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3.5 font-bold text-[#191919] hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/kakao.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          카카오로 시작하기
        </button>
        <button
          onClick={() => handleOAuth('google')}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3.5 font-semibold text-gray-700 hover:bg-gray-50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/google.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          구글로 시작하기
        </button>
      </div>

      {/* 이메일 로그인/회원가입 — 인앱 웹뷰(OAuth 차단 환경)에서도 가입할 수 있도록 항상 노출한다. */}
      <div className="mt-6 w-full">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] text-gray-400">또는 이메일로</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <form onSubmit={handleEmailSubmit} className="mt-3 space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
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
            placeholder={mode === 'signup' ? '비밀번호 (8자 이상)' : '비밀번호'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
          {mode === 'signup' && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="비밀번호 확인"
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
              ? mode === 'signup' ? '가입 중...' : '로그인 중...'
              : mode === 'signup' ? '이메일로 가입하기' : '이메일로 로그인'}
          </button>
        </form>
        {mode === 'login' && (
          <p className="mt-2 text-center text-[12px]">
            <Link href="/auth/forgot-password" className="text-gray-400 underline hover:text-gray-600">
              비밀번호를 잊으셨나요?
            </Link>
          </p>
        )}
        <p className="mt-3 text-center text-[12px] text-gray-500">
          {mode === 'signup' ? '이미 계정이 있나요? ' : '계정이 없나요? '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setConfirm(''); }}
            className="font-semibold text-orange-600 underline"
          >
            {mode === 'signup' ? '로그인' : '회원가입'}
          </button>
        </p>
      </div>

      {/* [베타 전면무료] 베타엔 결제 신호를 낮춘다: 결제약관 링크는 보존하되 강조를 빼고
          무료 가치 중심 문구로 톤다운한다(링크 삭제 아님). 플래그 off 시 기존 강조 문구로 원복. */}
      {BETA_FREE ? (
        <p className="mt-8 text-center text-[11px] text-gray-400">
          로그인하면{' '}
          <Link href="/legal/terms" className="underline">이용약관</Link>
          {', '}
          <Link href="/legal/privacy" className="underline">개인정보처리방침</Link>
          에 동의한 것으로 간주됩니다.{' '}
          <Link href="/legal/payment" className="text-gray-300 underline">결제 약관</Link>
        </p>
      ) : (
        <p className="mt-8 text-center text-[11px] text-gray-400">
          로그인하면{' '}
          <Link href="/legal/terms" className="underline">이용약관</Link>
          {', '}
          <Link href="/legal/privacy" className="underline">개인정보처리방침</Link>
          {' '}및{' '}
          <Link href="/legal/payment" className="underline">유료 결제 이용약관</Link>
          에 동의한 것으로 간주됩니다.
        </p>
      )}

      <a
        href="http://pf.kakao.com/_dcnGX/chat"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 text-center text-[12px] text-gray-500 underline hover:text-gray-700"
      >
        1:1 문의 (카카오톡 채널)
      </a>
    </main>
  );
}

export default function SignInClient() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-gray-500">로딩 중...</div>}>
      <SignInInner />
    </Suspense>
  );
}
