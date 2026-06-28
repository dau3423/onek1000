// 퍼널 이벤트 전송 — 클라이언트 전용. fire-and-forget(응답을 읽지 않음).
// navigator.sendBeacon 우선(페이지 이탈/리다이렉트 중에도 안전하게 전송됨),
// 미지원 시 keepalive fetch 폴백. 어떤 실패도 throw하지 않아 UX를 절대 깨지 않는다.
//
// device_id(onek_did)·세션 쿠키는 same-origin 요청에 자동 포함되므로 서버가 식별/연결한다.

export function track(event: string, props?: Record<string, unknown>): void {
  try {
    if (typeof window === 'undefined') return;
    const body = JSON.stringify({ event, props: props ?? null });

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // sendBeacon은 same-origin 쿠키를 포함해 전송한다.
      navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
      return;
    }

    void fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* 분석 실패는 무시 */
  }
}
