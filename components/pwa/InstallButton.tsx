'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { IosInstallGuide } from '@/components/pwa/IosInstallGuide';
import { ChevronRightIcon, InstallIcon } from '@/components/icons';
import { track } from '@/lib/analytics';

/**
 * 마이페이지 "지원" 섹션용 앱 설치 버튼.
 * - 크롬/엣지(안드로이드·PC): 클릭 시 네이티브 설치 프롬프트 표시
 * - iOS 사파리: 수동 안내 모달 표시
 * - 이미 설치(standalone)됨: 아무것도 렌더하지 않음
 */
export function InstallButton() {
  const t = useTranslations('pwa');
  const { ready, showInstall, isIos, canPrompt, promptInstall } = usePwaInstall();
  const [guideOpen, setGuideOpen] = useState(false);

  // 마운트 전(SSR) 또는 설치할 수 없는 환경에서는 노출하지 않는다(hydration mismatch 방지).
  if (!ready || !showInstall) return null;

  const handleClick = async () => {
    if (canPrompt) {
      // 네이티브 설치 프롬프트. 수락 시 appinstalled 이벤트로 버튼이 자동으로 숨겨진다.
      // 결과(accepted/dismissed)는 성장 계기판용으로만 계측('unsupported'는 제외).
      const outcome = await promptInstall();
      if (outcome === 'accepted' || outcome === 'dismissed') {
        track('pwa_install', { outcome });
      }
      return;
    }
    // iOS 등: 수동 안내
    setGuideOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="mb-3 flex w-full items-center justify-between rounded-xl bg-gray-50 p-4 text-left hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
      >
        <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
          <InstallIcon className="h-4 w-4" />{t('installButton.label')}
        </span>
        <span className="inline-flex items-center gap-0.5 text-sm text-primary">
          {isIos && !canPrompt ? t('installButton.ctaMethod') : t('installBanner.ctaInstall')}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      </button>
      {guideOpen && <IosInstallGuide onClose={() => setGuideOpen(false)} />}
    </>
  );
}
