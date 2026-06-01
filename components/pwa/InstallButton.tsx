'use client';

import { useState } from 'react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { IosInstallGuide } from '@/components/pwa/IosInstallGuide';

/**
 * 마이페이지 "지원" 섹션용 앱 설치 버튼.
 * - 크롬/엣지(안드로이드·PC): 클릭 시 네이티브 설치 프롬프트 표시
 * - iOS 사파리: 수동 안내 모달 표시
 * - 이미 설치(standalone)됨: 아무것도 렌더하지 않음
 */
export function InstallButton() {
  const { ready, showInstall, isIos, canPrompt, promptInstall } = usePwaInstall();
  const [guideOpen, setGuideOpen] = useState(false);

  // 마운트 전(SSR) 또는 설치할 수 없는 환경에서는 노출하지 않는다(hydration mismatch 방지).
  if (!ready || !showInstall) return null;

  const handleClick = async () => {
    if (canPrompt) {
      // 네이티브 설치 프롬프트. 결과(accepted/dismissed)는 별도 처리 불필요 —
      // 수락 시 appinstalled 이벤트로 버튼이 자동으로 숨겨진다.
      await promptInstall();
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
        <span className="text-sm text-gray-700 dark:text-gray-200">📲 홈 화면에 앱 설치</span>
        <span className="text-sm text-primary">{isIos && !canPrompt ? '방법 보기 →' : '설치 →'}</span>
      </button>
      {guideOpen && <IosInstallGuide onClose={() => setGuideOpen(false)} />}
    </>
  );
}
