'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Std = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Std);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * @param isPremium 푸시 버튼 노출 허용 여부. 광고 차단 전용 모델에선 결제가 아니라
 *   "로그인 여부"를 의미한다(모든 기능 무료 → 로그인 사용자면 누구나 허용).
 *   호출부(PushSection)가 로그인 기준값을 넘긴다. 미지정 시 로그인 여부로 폴백.
 */
export function EnablePushButton({ isPremium: allowProp }: { isPremium?: boolean } = {}) {
  const { data } = useSession();
  // 로그인만 되어 있으면 허용(결제 무관). 넘어온 값이 있으면 우선.
  const allow = allowProp ?? Boolean(data?.user?.id);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return setSubscribed(false);
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    });
  }, []);

  if (!allow) {
    return (
      <p className="text-xs text-gray-400">로그인하면 푸시 알림을 설정할 수 있어요.</p>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      const reg = (await navigator.serviceWorker.getRegistration())
        ?? (await navigator.serviceWorker.register('/sw.js'));
      const cur = await reg.pushManager.getSubscription();
      if (cur && subscribed) {
        await cur.unsubscribe();
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(cur.endpoint)}`, { method: 'DELETE' });
        setSubscribed(false);
      } else {
        const { publicKey } = await fetch('/api/push/vapid').then((r) => r.json());
        if (!publicKey) throw new Error('VAPID 키가 설정되지 않았어요.');
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const subJson = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...subJson, userAgent: navigator.userAgent }),
        });
        setSubscribed(true);
      }
    } catch (e) {
      alert('푸시 설정 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
    >
      {subscribed ? '🔔 푸시 알림 끄기' : '🔕 즐겨찾기 가격 변동 알림 받기'}
    </button>
  );
}
