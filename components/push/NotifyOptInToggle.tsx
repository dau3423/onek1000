'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ensurePushSubscription } from '@/lib/push/subscribe';

/**
 * 알림 종류별 옵트인 토글(주유 타이밍 / 세차 지수 공용).
 *
 * 핵심: **켤 때 푸시 구독까지 함께 확보한다.** 예전에는 이 토글이 DB 플래그만 저장해서,
 * "푸시 켜기" 버튼을 따로 누르지 않은 사용자에게는 아무 알림도 가지 않았다
 * (실측: 주유 타이밍 옵트인 2명 중 푸시 구독 보유 0명 → 발송 대상 0명).
 * 사용자가 두 단계를 스스로 알아야 하는 구조 자체가 문제라, 한 번의 조작으로 합쳤다.
 *
 * 끌 때는 구독을 해제하지 않는다 — 관심지역 가격 알림 등 다른 알림이 같은 구독을 쓴다.
 *
 * 권한 프롬프트는 사용자 제스처 안에서만 뜨므로 클릭 핸들러에서 바로 호출한다.
 * 실패하면 토글을 되돌리고 사유별 안내를 보여준다(조용히 실패하지 않는다).
 */
export function NotifyOptInToggle({
  initialOptIn,
  field,
  namespace,
  icon,
}: {
  initialOptIn: boolean;
  /** PATCH /api/profile 의 필드명. */
  field: 'forecastNotifyOptIn' | 'carwashNotifyOptIn';
  /** 제목·설명·각주 카피가 들어 있는 메시지 네임스페이스. */
  namespace: 'forecast.notify' | 'carwash.notify';
  icon: ReactNode;
}) {
  const t = useTranslations(namespace);
  const tMy = useTranslations('my');
  const [optIn, setOptIn] = useState(initialOptIn);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const next = !optIn;
    setBusy(true);
    setOptIn(next); // 낙관적 반영
    try {
      // 켤 때만 구독을 확보한다. 이미 구독이 있으면 멱등하게 통과한다.
      if (next) {
        const r = await ensurePushSubscription();
        if (!r.ok) {
          const msg =
            r.reason === 'unsupported' ? tMy('pushUnsupported')
            : r.reason === 'denied' ? tMy('pushDenied')
            : r.reason === 'vapid-missing' ? tMy('pushVapidMissing')
            : tMy('pushSubscribeFailed', { message: r.message ?? '' });
          throw new Error(msg);
        }
      }
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t('saveFailed'));
      }
    } catch (e) {
      setOptIn(!next); // 실패 시 원복 — 켜진 것처럼 보이는데 안 오는 상태를 만들지 않는다
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
            {icon}{t('heading')}
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
