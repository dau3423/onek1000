'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  onClose: () => void;
}

const strongTag = { strong: (chunks: React.ReactNode) => <strong>{chunks}</strong> };

/**
 * iOS 사파리 전용 "홈 화면에 추가" 수동 안내 모달.
 * iOS는 beforeinstallprompt를 지원하지 않아 프로그래매틱 설치가 불가능하므로,
 * 공유 → 홈 화면에 추가 단계를 안내한다. (기존 NaviConfirm 모달 톤과 일관)
 */
export function IosInstallGuide({ onClose }: Props) {
  const t = useTranslations('pwa.installGuide');
  const tCommon = useTranslations('common');
  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('dialogAria')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-900 sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold text-gray-900 dark:text-gray-50">
          {t('heading', { appName: tCommon('appName') })}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('subheading')}
        </p>

        <ol className="mt-4 space-y-3">
          <li className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              1
            </span>
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t.rich('step1Lead', strongTag)}
              <span aria-hidden className="mx-1 inline-flex h-5 w-5 items-center justify-center align-middle text-primary">
                {/* iOS 공유(↑) 아이콘 */}
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V4m0 0L8 8m4-4l4 4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6" />
                </svg>
              </span>
              {t('step1Trail')}
            </span>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              2
            </span>
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t.rich('step2', strongTag)}
            </span>
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              3
            </span>
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t.rich('step3', strongTag)}
            </span>
          </li>
        </ol>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary-dark"
        >
          {t('confirmButton')}
        </button>
      </div>
    </div>
  );
}
