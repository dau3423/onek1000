'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

/**
 * 로그아웃 버튼. 바로 로그아웃하지 않고 확인 모달을 띄운 뒤,
 * 사용자가 [로그아웃]을 누른 경우에만 signOut을 실행한다.
 * - 접근성: role=dialog/aria-modal, 백드롭 클릭·ESC로 취소.
 * - 디자인 톤은 기존 확인 모달(NaviConfirm)과 일관.
 */
export function SignOutButton() {
  const t = useTranslations('my.signOut');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // ESC로 취소(모달 열린 동안만).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function handleConfirm() {
    setBusy(true);
    void signOut({ callbackUrl: '/' });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        {t('button')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={t('confirmAria')}
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-900 sm:rounded-2xl sm:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold text-gray-900 dark:text-gray-50">{t('confirmHeading')}</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('confirmBody')}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={busy}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-60"
              >
                {busy ? t('confirming') : t('button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
