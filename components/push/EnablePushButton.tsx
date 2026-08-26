'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { BellIcon, BellOffIcon } from '@/components/icons';
import { ensurePushSubscription, isPushSubscribed, unsubscribePush } from '@/lib/push/subscribe';

/**
 * @param isPremium 푸시 버튼 노출 허용 여부. 광고 차단 전용 모델에선 결제가 아니라
 *   "로그인 여부"를 의미한다(모든 기능 무료 → 로그인 사용자면 누구나 허용).
 *   호출부(PushSection)가 로그인 기준값을 넘긴다. 미지정 시 로그인 여부로 폴백.
 */
export function EnablePushButton({ isPremium: allowProp }: { isPremium?: boolean } = {}) {
  const t = useTranslations('my');
  const { data } = useSession();
  // 로그인만 되어 있으면 허용(결제 무관). 넘어온 값이 있으면 우선.
  const allow = allowProp ?? Boolean(data?.user?.id);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    isPushSubscribed().then((v) => { if (alive) setSubscribed(v); });
    return () => { alive = false; };
  }, []);

  if (!allow) {
    return (
      <p className="text-xs text-gray-400">{t('pushLoginHint')}</p>
    );
  }

  // 구독 생성/해제는 lib/push/subscribe 에 모아 두었다 — 알림 종류 토글(NotifyOptInToggle)도
  // 같은 함수를 써서 "푸시 켜기를 따로 눌러야 하는" 두 단계를 없앴다.
  const toggle = async () => {
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribePush();
        setSubscribed(false);
        return;
      }
      const r = await ensurePushSubscription();
      if (!r.ok) {
        const msg =
          r.reason === 'unsupported' ? t('pushUnsupported')
          : r.reason === 'denied' ? t('pushDenied')
          : r.reason === 'vapid-missing' ? t('pushVapidMissing')
          : t('pushSubscribeFailed', { message: r.message ?? '' });
        alert(msg);
        return;
      }
      setSubscribed(true);
    } catch (e) {
      alert(t('pushSubscribeFailed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
    >
      {subscribed ? (
        <>
          <BellIcon className="h-4 w-4" />{t('pushDisableAction')}
        </>
      ) : (
        <>
          <BellOffIcon className="h-4 w-4" />{t('pushEnableAction')}
        </>
      )}
    </button>
  );
}
