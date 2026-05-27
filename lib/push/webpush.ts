// Web Push 헬퍼 (VAPID, FCM 호환 endpoint 자동 라우팅)
// `web-push` 패키지 사용 — Node 런타임 전용.

import webpush from 'web-push';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@onek1000.kr';
  if (!pub || !priv) throw new Error('VAPID keys missing');
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** 클라이언트 SW에서 사용할 태그 (같은 태그는 갈음) */
  tag?: string;
}

export async function sendPush(sub: PushSub, payload: PushPayload): Promise<{ ok: true } | { ok: false; gone: boolean; error: string }> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number; message?: string };
    const gone = err.statusCode === 404 || err.statusCode === 410;
    return { ok: false, gone, error: err.message ?? String(e) };
  }
}
