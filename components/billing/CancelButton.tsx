'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CancelButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onCancel = async () => {
    if (!confirm('구독을 해지하시겠어요?\n현재 기간 종료일까지는 광고 없이 계속 사용할 수 있어요.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      alert('해지가 완료됐어요.');
      router.refresh();
    } catch (e) {
      alert('해지 실패: ' + (e instanceof Error ? e.message : String(e)));
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
      {busy ? '처리 중...' : '구독 해지하기'}
    </button>
  );
}
