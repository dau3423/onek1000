'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function CancelButton() {
  const t = useTranslations('my.cancel');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onCancel = async () => {
    if (!confirm(t('confirmMessage'))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      alert(t('doneMessage'));
      router.refresh();
    } catch (e) {
      alert(t('failedPrefix', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onCancel}
      disabled={busy}
      className="w-full rounded-lg border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      {busy ? t('processingLabel') : t('buttonLabel')}
    </button>
  );
}
