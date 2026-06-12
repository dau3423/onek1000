// 방문 ping — 공개(인증 불필요).
// 디바이스 기준 고유 방문을 page_visits에 하루 1회 기록한다(관리자 "오늘 방문자수(KST)" 카드용).
//
// 흐름:
//   1) device_id 쿠키 읽기 → 없으면 무작위 UUID 발급 + Set-Cookie(maxAge 1년, SameSite=Lax, httpOnly).
//   2) 로그인 세션이 있으면 user_id 동봉(연관 분석용, 카운트 기준은 어디까지나 device_id).
//   3) page_visits에 upsert(visit_date=KST today, device_id, user_id) — (visit_date,device_id) 유니크라
//      중복은 무해한 no-op.
//
// 견고성: Supabase 미설정/DB 에러여도 항상 200류로 응답한다. 방문 ping이 실패해도
//   사용자 경험을 깨뜨리면 안 된다(쿠키 발급/응답은 정상 진행). 라우트는 얇게, upsert는 lib/db/stats.

import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { recordVisit } from '@/lib/db/stats';
import { redis, keys } from '@/lib/cache/redis';

export const runtime = 'nodejs';

// device_id 쿠키 이름(클라이언트 components/VisitPing.tsx는 이 쿠키를 직접 읽지 않는다).
const DEVICE_COOKIE = 'onek_did';
const ONE_YEAR_SEC = 365 * 24 * 60 * 60;

// UUID 형식만 신뢰(쿠키 변조/오염 시 새로 발급). 무작위 UUID 외 식별정보는 저장하지 않는다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// rate limit 정책: IP당 60초 윈도우에 최대 10회. 정상 사용자(앱 로드당 1회 + 클라
// localStorage 일자 dedupe)는 절대 안 걸린다. 초과 시 page_visits 기록만 스킵.
const RATE_WINDOW_SEC = 60;
const RATE_LIMIT = 10;

// 클라이언트 IP 추출: x-forwarded-for 첫 값 → x-real-ip → 'unknown'.
// (이 코드베이스엔 공용 파서가 없어 route 내 소형 헬퍼로 처리)
function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(req: NextRequest) {
  // 1) device_id: 쿠키에서 읽고, 없거나 형식이 깨졌으면 새로 발급.
  const existing = req.cookies.get(DEVICE_COOKIE)?.value;
  const isValid = typeof existing === 'string' && UUID_RE.test(existing);
  const deviceId = isValid ? existing : crypto.randomUUID();

  // 2) 로그인 세션이면 user_id 동봉(없으면 null). 세션 조회 실패는 무시(비로그인 취급).
  let userId: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.revoked && session?.user?.id) userId = session.user.id;
  } catch {
    /* 세션 조회 실패는 비로그인 취급 */
  }

  // 3) IP 기반 rate limit으로 page_visits 기록 여부 결정.
  //    incrWithTtl는 미설정(Upstash 없음)/에러 시 0을 반환 → count(0) > limit이 거짓이라
  //    항상 '통과'. 로컬/테스트(미설정)는 기존과 100% 동일하게 정상 기록된다.
  const ip = clientIp(req);
  const count = await redis.incrWithTtl(keys.visitRate(ip), RATE_WINDOW_SEC);
  const limited = count > RATE_LIMIT;

  // 4) 한도 초과가 아니면 방문 기록(멱등 upsert). 내부에서 미설정/에러를 graceful 처리.
  //    초과 시엔 행을 쓰지 않고 조용히 통과(쿠키는 아래에서 기존대로 발급).
  if (!limited) await recordVisit(deviceId, userId);

  const res = NextResponse.json({ ok: true });
  // 새 디바이스면 영속 쿠키 발급(클라가 읽을 필요 없어 httpOnly).
  if (!isValid) {
    res.cookies.set(DEVICE_COOKIE, deviceId, {
      path: '/',
      maxAge: ONE_YEAR_SEC,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return res;
}
