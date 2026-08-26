'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DropletIcon } from '@/components/icons';

/**
 * 세차 지수 알림 토글. 구조·톤은 ForecastNotifyToggle 과 같게 맞춘다
 * (같은 알림 설정 영역에 나란히 놓이므로 형태가 다르면 오히려 어색하다).
 *
 * - PATCH /api/profile { carwashNotifyOptIn } 로 즉시 저장(낙관적 반영, 실패 시 원복).
 * - 실제 발송은 carwash-notify 배치가 담당하며, 푸시 구독이 있어야 알림이 도착한다.
 *   (이 토글은 "받겠다는 동의"만 저장 — 푸시 켜기는 위의 알림 버튼에서.)
 * - 기본값은 false(보수적 옵트인): 사용자가 켠 경우에만 발송된다.
 */
export function CarwashNotifyToggle({ initialOptIn }: { initialOptIn: boolean }) {
  const t = useTranslations('carwash.notify');
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
        body: JSON.stringify({ carwashNotifyOptIn: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t('saveFailed'));
      }
    } catch (e) {
      setOptIn(!next); // 실패 시 원복
      alert(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            <DropletIcon className="h-4 w-4" />{t('heading')}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{t('description')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optIn}
          aria-label={t('toggleAria')}
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
        {t('footnote')}
      </p>
    </div>
  );
}
