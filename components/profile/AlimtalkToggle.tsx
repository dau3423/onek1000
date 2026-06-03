'use client';

import { useState } from 'react';

/**
 * 카카오 알림톡 수신 동의 토글. 서버에서 검증한 현재 값(initialOptIn)을 초기 상태로 받는다.
 * 토글 시 PATCH /api/profile { alimtalkOptIn } 로 즉시 저장하고, 실패 시 원복 + 안내.
 * 실제 알림톡 발송 연동(비즈채널/발송사 + 휴대폰번호 수집)은 후속 작업이며,
 * 이 토글은 수신 동의 설정 저장·표시까지만 담당한다.
 */
export function AlimtalkToggle({ initialOptIn }: { initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const next = !optIn;
    setBusy(true);
    setOptIn(next); // 낙관적 반영
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alimtalkOptIn: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? '저장에 실패했어요.');
      }
    } catch (e) {
      setOptIn(!next); // 실패 시 원복
      alert(e instanceof Error ? e.message : '저장에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-700">💬 카카오 알림톡 수신</div>
          <p className="mt-0.5 text-xs text-gray-500">주유 할인·이벤트 소식을 카카오 알림톡으로 받기</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optIn}
          aria-label="카카오 알림톡 수신"
          onClick={toggle}
          disabled={busy}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            optIn ? 'bg-primary' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              optIn ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-gray-400">
        광고성 정보 수신에 동의하는 항목이에요. 언제든 끌 수 있어요.
      </p>
    </div>
  );
}
