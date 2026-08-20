// device_id 쿠키(onek_did) 단일 정의.
//
// 왜 한 곳으로 모았나: /api/visit 과 /api/event 가 각자 쿠키를 읽고 "없으면 발급"했다.
// 첫 방문에는 두 요청이 동시에 나가는데(VisitPing 이 landing_view 비콘과 방문 ping 을 같이 쏜다)
// 둘 다 쿠키가 없는 상태로 도착해 서로 다른 UUID 를 발급했다. 그 결과 같은 사람이
// page_visits 에는 A, funnel_events 에는 B 로 남아 두 테이블을 조인할 수 없게 됐다.
// 실측(2026-08-20): landing_view 를 남긴 기기 819개 중 page_visits 에도 있는 기기는 58개(7%).
// 분모와 분자가 다른 ID 공간에 있었으므로 그 기간의 퍼널 '비율'은 신뢰할 수 없다.
//
// 지금 구조: 발급자는 미들웨어 하나뿐이고(문서 요청에서 심는다), 수집 라우트는 읽기만 한다.

/** 영속 device 쿠키 이름. 무작위 UUID 외 어떤 식별 정보도 담지 않는다. */
export const DEVICE_COOKIE = 'onek_did';

export const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** UUID 형식만 신뢰(변조·오염 쿠키는 무효 취급). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDeviceId(v: string | undefined | null): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
