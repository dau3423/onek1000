// 세차 지수 알림 — 발송 판정 + dedupe 순수함수.
//
// DB/네트워크 의존 없이 "보낼지 말지"만 결정한다(단위 검증 용이). 실제 조회/발송은
// app/api/internal/carwash-notify/route.ts 가 담당하고, 판정은 여기 함수에 위임한다.
// 구조는 lib/forecast/notify.ts 와 같다 — 같은 패턴을 두 번 쓰는 편이 각자 다른 규칙을
// 갖는 것보다 운영에서 예측 가능하다.
//
// 설계 원칙(스팸 방지, 보수적):
//   - 등급이 'good' 일 때만 보낸다(fair/bad 제외). 점수 임계도 함께 둔다.
//   - 세차하기 좋은 날은 연달아 이어지기 쉽다(맑은 날이 며칠씩). 매일 보내면 스팸이 되므로
//     직전 발송 이후 MIN_RESEND_DAYS 이내면 보내지 않는다.
//   - 같은 날짜(date)로는 절대 두 번 보내지 않는다(배치 재실행/중복 기동 방어).

/** carwash_index.grade 와 같은 체계. */
export type CarwashGrade = 'good' | 'fair' | 'bad';

/** 발송 임계 점수 — 등급이 good 이어도 이 점수 미만이면 보내지 않는다. */
export const CARWASH_NOTIFY_MIN_SCORE = 70;

/**
 * 직전 발송 이후 같은 사용자에게 다시 보내기까지의 최소 간격(일).
 * 맑은 날이 이어질 때 매일 울리는 것을 막는다. 주 1회 남짓으로 수렴하도록 5일로 둔다.
 */
export const CARWASH_NOTIFY_MIN_RESEND_DAYS = 5;

/** 발송 후보(오늘자 해당 시도의 지수). */
export interface CarwashSnapshot {
  region: string; // 시도 코드('01'..)
  date: string;   // YYYY-MM-DD (KST)
  grade: CarwashGrade;
  score: number;  // 0~100
}

/** 같은 사용자의 직전 발송 이력(없으면 null). */
export interface CarwashLastSent {
  date: string;   // YYYY-MM-DD
  sentAt: string; // ISO timestamp
}

export interface CarwashNotifyOptions {
  minScore?: number;
  minResendDays?: number;
  /** 판정 기준 '지금' 시각(ISO). 테스트 주입용. 미지정 시 Date.now(). */
  now?: string;
}

export type CarwashSkipReason =
  | 'not-good'    // 등급이 good 이 아님
  | 'low-score'   // 점수 임계 미만
  | 'same-date'   // 그 날짜로 이미 보냄
  | 'cooldown';   // 쿨다운 이내

export type CarwashNotifyDecision =
  | { send: true }
  | { send: false; reason: CarwashSkipReason };

/** 두 ISO 시점 사이 경과 일수(절대값, 소수 포함). */
function daysBetween(aIso: string, bIso: string): number {
  return Math.abs(Date.parse(aIso) - Date.parse(bIso)) / 86400000;
}

/**
 * 오늘자 지수 + 직전 발송 이력으로 "이 사용자에게 지금 보낼지" 판정.
 * 순수함수: 외부 의존 없음.
 */
export function decideCarwashNotify(
  snap: CarwashSnapshot,
  last: CarwashLastSent | null,
  opts: CarwashNotifyOptions = {},
): CarwashNotifyDecision {
  const minScore = opts.minScore ?? CARWASH_NOTIFY_MIN_SCORE;
  const minResendDays = opts.minResendDays ?? CARWASH_NOTIFY_MIN_RESEND_DAYS;
  const nowIso = opts.now ?? new Date().toISOString();

  if (snap.grade !== 'good') return { send: false, reason: 'not-good' };
  if (snap.score < minScore) return { send: false, reason: 'low-score' };
  if (!last) return { send: true };

  // 같은 날짜로는 두 번 보내지 않는다 — 배치가 하루에 두 번 돌아도 안전하게.
  if (last.date === snap.date) return { send: false, reason: 'same-date' };

  // 맑은 날 연속 구간에서 매일 울리지 않도록 쿨다운.
  if (daysBetween(nowIso, last.sentAt) < minResendDays) return { send: false, reason: 'cooldown' };

  return { send: true };
}

/**
 * 세차 지수 푸시 카피.
 *
 * ⚠️ 지역명을 반드시 넣는다. 사용자 위치는 관심지역이 없으면 IP 기반 시도로 폴백하는데
 *    그 값이 틀릴 수 있어(모바일 통신사는 서울로 잡히는 경우가 흔하다), 판정 지역을
 *    보여줘야 사용자가 "내 동네 얘기가 아니네"를 즉시 알아챈다.
 * ⚠️ 지수는 근사·참고용이라 단정하지 않는다("좋아요" 수준까지만, "세차하세요" 금지).
 */
export function buildCarwashNotifyPayload(
  regionName: string,
  score: number,
): { title: string; body: string; url: string; tag: string } {
  return {
    title: '🚿 오늘 세차하기 좋아요',
    body: `${regionName} 기준 세차 지수 ${score}점 — 당분간 비 소식이 적어요`,
    // forecast 알림의 '/?forecast=1' 과 같은 형태의 표식. 현재 앱은 이 파라미터로
    // 화면을 바꾸지 않으며(유입 구분용), 홈 하단 세차 지수 카드가 상세를 보여준다.
    url: '/?carwash=1',
    tag: 'carwash-good',
  };
}
