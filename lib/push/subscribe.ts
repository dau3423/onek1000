// 웹푸시 구독 확보/해제 — 클라이언트 전용 공용 모듈.
//
// 왜 분리했나: 예전에는 구독 로직이 EnablePushButton 안에만 있었다. 그래서 "푸시 켜기"
// 버튼과 "무엇을 받을지" 토글이 완전히 분리돼, **토글만 켠 사용자에게는 아무것도 가지 않았다**
// (실측: 주유 타이밍 옵트인 2명 중 푸시 구독 보유 0명 → 발송 대상 0명). 이제 토글도
// 이 모듈을 불러 구독까지 함께 확보한다 — 사용자는 한 번만 누르면 된다.
//
// 권한 프롬프트는 **사용자 제스처 안에서만** 뜬다. 호출부는 반드시 클릭 핸들러에서 부를 것.

/** VAPID public key(base64url) → Uint8Array. pushManager.subscribe 가 요구하는 형식. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Std = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Std);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

export type PushFailReason =
  /** 서비스워커/푸시 미지원 브라우저. iOS 는 홈 화면에 추가해야 지원된다(16.4+). */
  | 'unsupported'
  /** 사용자가 알림을 차단함 — 사이트 설정에서 직접 풀어야 하며 다시 물을 수 없다. */
  | 'denied'
  /** 서버에 VAPID 공개키가 없음(설정 문제). */
  | 'vapid-missing'
  /** 그 외 실패(네트워크/서비스워커 등). */
  | 'failed';

export type EnsurePushResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; reason: PushFailReason; message?: string };

function supported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** 현재 이 기기에 푸시 구독이 있는지. 미지원/미등록이면 false. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!supported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    return Boolean(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/**
 * 구독을 확보한다. 이미 있으면 그대로 두고 성공을 돌려준다(멱등).
 * 없으면 권한을 요청하고 구독을 만들어 서버에 등록한다.
 *
 * throw 하지 않는다 — 호출부가 실패 사유별로 다른 안내를 보여줄 수 있게 결과로 돌려준다.
 */
export async function ensurePushSubscription(): Promise<EnsurePushResult> {
  if (!supported()) return { ok: false, reason: 'unsupported' };
  // 이미 차단된 상태면 subscribe() 가 조용히 실패한다 — 먼저 걸러 정확한 안내를 준다.
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };

  try {
    const reg = (await navigator.serviceWorker.getRegistration())
      ?? (await navigator.serviceWorker.register('/sw.js'));

    const existing = await reg.pushManager.getSubscription();
    if (existing) return { ok: true, alreadySubscribed: true };

    const { publicKey } = await fetch('/api/push/vapid').then((r) => r.json()) as { publicKey?: string };
    if (!publicKey) return { ok: false, reason: 'vapid-missing' };

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
    return { ok: true, alreadySubscribed: false };
  } catch (e) {
    // 사용자가 프롬프트에서 거부하면 NotAllowedError 가 온다 — 'denied' 로 구분해 안내를 맞춘다.
    const name = (e as { name?: string } | null)?.name;
    if (name === 'NotAllowedError') return { ok: false, reason: 'denied' };
    return { ok: false, reason: 'failed', message: e instanceof Error ? e.message : String(e) };
  }
}

/** 이 기기의 구독을 해제하고 서버에서도 지운다. 구독이 없으면 아무것도 하지 않는다. */
export async function unsubscribePush(): Promise<void> {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const cur = await reg?.pushManager.getSubscription();
  if (!cur) return;
  await cur.unsubscribe();
  await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(cur.endpoint)}`, { method: 'DELETE' });
}
