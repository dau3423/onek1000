// 인앱 알림 효과음 — Web Audio로 짧은 "딩동" 비프를 합성한다(에셋 파일 불필요).
// 브라우저 autoplay 정책: 사용자 상호작용 없이 시작된 AudioContext는 suspended 상태일 수 있다.
// 사용자가 이미 앱과 상호작용(탭/네비/위치동의)한 세션 안에서 트리거되면 정상 재생되고,
// 차단/미지원 시에는 조용히 무시한다(절대 throw하지 않음 → UI가 깨지지 않게).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** 단일 톤 재생(부드러운 attack/release로 클릭음 방지). */
function tone(ac: AudioContext, freq: number, startAt: number, dur: number, gain: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // 짧은 페이드 인/아웃으로 과하지 않고 거슬리지 않게
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

/**
 * 알림 효과음("딩-동" 2음, 약 0.3초). 음량은 작게(0.12) 잡아 과하지 않게 한다.
 * autoplay 차단 등으로 실패해도 조용히 무시한다.
 */
export function playAlertChime() {
  const ac = getCtx();
  if (!ac) return;
  try {
    // suspended(자동재생 정책) 상태면 재개 시도 — 실패해도 무시
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    const t0 = ac.currentTime + 0.01;
    tone(ac, 880, t0, 0.16, 0.12); // 딩 (A5)
    tone(ac, 660, t0 + 0.14, 0.2, 0.12); // 동 (E5)
  } catch {
    // 미지원/차단 — 무시
  }
}
