'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

// 회원탈퇴 버튼.
// 1) 되돌릴 수 없음을 한 번 더 확인 → 2) 탈퇴 API 호출 → 3) NextAuth 세션 무효화(signOut) 후 홈 이동.
export function DeleteAccountButton() {
  const t = useTranslations('my');
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    const ok = confirm(t('account.deleteConfirmMessage'));
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      // 세션 무효화 후 홈으로 이동.
      await signOut({ callbackUrl: '/' });
    } catch (e) {
      alert(t('account.deleteFailed', { message: e instanceof Error ? e.message : String(e) }));
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className="w-full text-center text-xs text-gray-400 underline hover:text-gray-500 disabled:opacity-60 dark:text-gray-500 dark:hover:text-gray-400"
    >
      {busy ? t('account.processingLabel') : t('account.deleteButtonLabel')}
    </button>
  );
}
