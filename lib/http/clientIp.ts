// 요청의 클라이언트 IP 판별 (레이트리밋 식별자용)
//
// ★ 헤더 우선순위가 보안에 직결된다. x-forwarded-for 의 첫 항목은 **클라이언트가 직접 넣을 수
//   있다** — 프록시는 뒤에 덧붙일 뿐 앞을 지우지 않는다. 그 값을 식별자로 쓰면 헤더만 바꿔가며
//   보내는 것으로 레이트리밋이 그대로 뚫린다.
//   프로덕션은 Firebase App Hosting 이고, 플랫폼이 직접 설정하는 x-fah-client-ip 는 위조할 수
//   없으므로 이것을 최우선으로 본다. 나머지는 로컬/타 환경용 폴백이다.
//
// 이 함수는 원래 event/visit/carwash-index 세 라우트에 각각 복제돼 있었고, 그중 visit 만
// x-fah-client-ip 를 봤다. 나머지 둘은 위조 가능한 값으로 제한을 걸고 있었다.

/** 헤더만 읽으므로 NextRequest/Request 어느 쪽이든 받는다. */
type HeaderBearing = { headers: { get(name: string): string | null } };

export function clientIp(req: HeaderBearing): string {
  // 1) 플랫폼이 설정 — 위조 불가.
  const fah = req.headers.get('x-fah-client-ip')?.trim();
  if (fah) return fah;
  // 2) 폴백 — 신뢰도가 낮다는 점을 알고 쓴다.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
