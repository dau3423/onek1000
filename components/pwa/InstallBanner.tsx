'use client';

import { useEffect, useState } from 'react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { IosInstallGuide } from '@/components/pwa/IosInstallGuide';

const DISMISS_KEY = 'pwa-install-banner-dismissed';

/**
 * 홈 화면용 가벼운 설치 안내 배너.
 * - 한 번 닫으면(localStorage) 다시 뜨지 않는다.
 * - 크롬/엣지: 네이티브 프롬프트, iOS: 수동 안내 모달.
 * - 이미 설치됨/설치 불가 환경에서는 노출하지 않는다.
 *
 * 부모(map-container) 기준 상단에 absolute로 떠 있다. 우측 상단의 ⓘ/전체화면
 * 버튼과 겹치지 않게 right-16으로 공간을 비워 두고, 1km 알람(RadiusAlert,
 * top≈108px)보다 위(top-3)에 두어 세로로 분리한다.
 */
export function InstallBanner() {
  const { ready, showInstall, isIos, canPrompt, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true); // 기본 숨김 → 마운트 후 localStorage 확인
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      // 프라이빗 모드 등 localStorage 접근 불가 시: 노출하되 닫기만 세션 한정
      setDismissed(false);
    }
  }, []);

  if (!ready || !showInstall || dismissed) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* noop */
    }
  };

  const handleInstall = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      // 설치 수락 시 appinstalled로 자동 숨김. 거절해도 배너는 닫아 방해를 줄인다.
      if (outcome === 'accepted' || outcome === 'dismissed') close();
      return;
    }
    setGuideOpen(true);
  };

  return (
    <>
      <div className="absolute left-3 right-16 top-3 z-30 flex items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur dark:bg-gray-800/95">
        <span className="text-xl" aria-hidden>
          📲
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-50">앱으로 더 빠르게</p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            홈 화면에 추가하고 바로 최저가를 확인하세요.
          </p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-dark"
        >
          {isIos && !canPrompt ? '방법' : '설치'}
        </button>
        <button
          onClick={close}
          aria-label="설치 안내 닫기"
          className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {guideOpen && <IosInstallGuide onClose={() => setGuideOpen(false)} />}
    </>
  );
}
