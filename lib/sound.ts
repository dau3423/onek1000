// 인앱 알림 효과음 — Web Audio로 짧은 알림 멜로디를 합성한다(에셋 파일 불필요).
// 브라우저 autoplay 정책: 사용자 상호작용 없이 시작된 AudioContext는 suspended 상태일 수 있다.
// 사용자가 이미 앱과 상호작용(탭/네비/위치동의)한 세션 안에서 트리거되면 정상 재생되고,
// 차단/미지원 시에는 조용히 무시한다(절대 throw하지 않음 → UI가 깨지지 않게).
//
// 추가로, OS 시스템 알림음 폴백(Notification API)을 제공한다. 인앱음은 모바일 무음스위치/볼륨에
// 종속되지만 시스템 알림은 OS 알림 채널을 타므로 보완이 된다. 단 포그라운드에서는 소리가 안 날 수
// 있어 '추가/폴백'일 뿐이며, 인앱음(playAlertChime)이 항상 함께 보장된다.

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

/**
 * 단일 톤 재생(부드러운 attack/release로 클릭음 방지).
 * 음량을 키워도 귀 아프지 않도록 짧은 페이드 인 + 지수 감쇠 envelope를 둔다.
 */
function tone(ac: AudioContext, freq: number, startAt: number, dur: number, gain: number, dest: AudioNode) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  // 삼각파: sine보다 배음이 있어 같은 음량에서도 더 또렷하게 들린다(주행 중 인지도↑).
  osc.type = 'triangle';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(g).connect(dest);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

/**
 * 알림 효과음 — 3음 상승 멜로디(도-미-솔 느낌)를 2회 반복해 주행 중에도 인지되는 패턴으로 재생한다.
 * 마스터 gain으로 전체 음량을 키우되(0.6 기준), 동시 발음이 겹쳐도 클리핑되지 않게 약한 compressor를 둔다.
 *
 * @param volumeScale 0~1. 시스템 알림과 동시에 날 때 인앱음을 약간 낮추는 등 미세 조율용(기본 1).
 */
export function playAlertChime(volumeScale = 1) {
  const ac = getCtx();
  if (!ac) return;
  try {
    // suspended(자동재생 정책) 상태면 재개 시도 — 실패해도 무시
    if (ac.state === 'suspended') void ac.resume().catch(() => {});

    // 마스터 체인: gain → compressor → destination.
    // compressor가 피크를 눌러줘 음량을 크게 잡아도 귀를 찌르지 않는다.
    const master = ac.createGain();
    master.gain.value = Math.max(0, Math.min(1, volumeScale));
    let chainHead: AudioNode = ac.destination;
    try {
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      comp.connect(ac.destination);
      chainHead = comp;
    } catch {
      // compressor 미지원 환경 — destination 직결
    }
    master.connect(chainHead);

    const t0 = ac.currentTime + 0.02;
    // 한 묶음 = 3음 상승 멜로디(C6-E6-G6). 또렷하게 들리도록 중고역대.
    const melody: Array<[number, number]> = [
      [1047, 0.0], // C6
      [1319, 0.12], // E6
      [1568, 0.24], // G6
    ];
    const g = 0.6; // 음당 게인(master·compressor로 전체 안전하게 제어)
    // 2회 반복(두 번째 묶음은 첫 묶음 종료 직후) → "띠리링 띠리링" 인지 패턴.
    const groupGap = 0.52;
    for (let rep = 0; rep < 2; rep++) {
      const base = t0 + rep * groupGap;
      for (const [freq, off] of melody) {
        tone(ac, freq, base + off, 0.16, g, master);
      }
    }
  } catch {
    // 미지원/차단 — 무시
  }
}

/**
 * 시스템 알림 권한 확보(필요 시 1회 요청).
 * 무분별한 자동요청 금지를 위해 "사용자 인터랙션(길안내 시작/따라가기 등) 핸들러"에서만 호출할 것.
 * - 'granted'면 그대로 true.
 * - 'default'면 권한 요청 → 결과 반환.
 * - 'denied'/미지원/실패면 false(조용히 인앱음만 사용).
 */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  try {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

/** 현재 시스템 알림 권한이 granted인지(요청 없이 조회만). */
export function isNotifyGranted(): boolean {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  try {
    return Notification.permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * OS 시스템 알림 표시(폴백/추가). 권한이 granted일 때만 띄운다.
 * 포그라운드에서는 OS/브라우저 정책상 소리가 안 날 수 있으나, 이는 인앱음으로 보장된다.
 * 모든 실패(미지원/권한없음/예외)는 흡수하고 절대 throw하지 않는다.
 */
export function notifyRouteAlert(opts: { title: string; body: string; tag?: string }) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  try {
    if (Notification.permission !== 'granted') return;
    const n = new Notification(opts.title, {
      body: opts.body,
      // 같은 tag는 알림을 갈아끼워 중복 누적을 막는다(대상 변경 시마다 1건만).
      tag: opts.tag ?? 'route-alert',
      icon: '/icons/icon-192.png',
      silent: false,
    });
    // 일정 시간 뒤 자동 닫기(쌓임 방지). 실패해도 무시.
    window.setTimeout(() => {
      try {
        n.close();
      } catch {
        /* noop */
      }
    }, 6000);
  } catch {
    // 미지원/차단 — 무시
  }
}
