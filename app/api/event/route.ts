// 퍼널 이벤트 수집 — 공개(인증 불필요). /api/visit 과 동일한 device_id 쿠키·세션·rate-limit 패턴.
//
// 흐름:
//   1) onek_did 쿠키로 device_id 식별(없으면 발급 + Set-Cookie). VisitPing이 먼저 발급하므로 보통 존재.
//   2) 로그인 세션이면 user_id 동봉(없으면 null).
//   3) IP rate limit 통과 시 funnel_events에 1행 insert.
//
// 견고성: 분석이 UX를 깨면 안 되므로 어떤 경우에도 200류로 응답한다.
//   클라이언트는 navigator.sendBeacon으로 fire-and-forget 전송한다(응답을 읽지 않음).

import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { recordEvent } from '@/lib/db/stats';
import { redis, keys } from '@/lib/cache/redis';

export const runtime = 'nodejs';

const DEVICE_COOKIE = 'onek_did';
const ONE_YEAR_SEC = 365 * 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 이벤트는 방문보다 빈번하므로 한도를 넉넉히(IP당 60초에 60회). 초과 시 기록만 스킵.
const RATE_WINDOW_SEC = 60;
const RATE_LIMIT = 60;

// 화이트리스트 — 임의 문자열 오염을 막고 집계 대상을 고정한다.
const ALLOWED_EVENTS = new Set([
  'landing_view',        // 첫 화면(지도) 진입
  'signin_view',         // 로그인 화면 도달
  'oauth_click',         // 카카오/구글 버튼 클릭(props.provider, props.inApp)
  'email_submit',        // 이메일 폼 제출(props.mode = login|signup)
  'signup_success',      // 이메일 회원가입 성공
  'auth_success',        // 로그인 성공(props.method, props.mode)
  // ── 핵심 가치 행동(성장 계기판). props에는 stationId(공개 오피넷 ID)까지만 허용 —
  //    좌표·주소·검색어 등 위치/개인정보성 값은 절대 넣지 않는다.
  'station_detail_view', // 주유소 상세 화면 열림(props.stationId) — 열릴 때마다 1건
  'navi_click',          // 길찾기 CTA 클릭(props.stationId)
  'forecast_view',       // 주유 타이밍 예측 카드 열람/펼침(props.direction?)
  'route_search',        // 경로 최저가 검색 실행(props 없음)
  'fuel_log_saved',      // 주유 기록 저장 성공(props 없음)
  'pwa_install',         // 설치 프롬프트 결과(props.outcome = accepted|dismissed)
  // ── 세차 묶음(FR-1/FR-3) — 위치/개인정보성 값은 담지 않는다.
  'carwash_filter_on',   // 세차 필터 칩 OFF→ON 전이(props 없음)
  'carwash_card_click',  // 세차 카드 CTA 클릭(props.bestDay=YYYY-MM-DD, props.grade)
]);

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(req: NextRequest) {
  // body 파싱 실패/형식 오류여도 200(분석은 UX를 깨지 않는다).
  let event = '';
  let props: Record<string, unknown> | null = null;
  try {
    const body = (await req.json()) as { event?: unknown; props?: unknown };
    if (typeof body.event === 'string') event = body.event;
    if (body.props && typeof body.props === 'object') props = body.props as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  // 1) device_id: 쿠키에서 읽고 없거나 깨졌으면 발급.
  const existing = req.cookies.get(DEVICE_COOKIE)?.value;
  const isValid = typeof existing === 'string' && UUID_RE.test(existing);
  const deviceId = isValid ? existing : crypto.randomUUID();

  // 화이트리스트 밖 이벤트는 기록하지 않되, 쿠키 발급/200 응답은 유지.
  if (ALLOWED_EVENTS.has(event)) {
    // 2) 로그인 세션이면 user_id 동봉.
    let userId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      if (!session?.revoked && session?.user?.id) userId = session.user.id;
    } catch {
      /* 비로그인 취급 */
    }

    // 3) IP rate limit. incrWithTtl는 미설정/에러 시 0 → 항상 통과(로컬/테스트 동일 동작).
    const count = await redis.incrWithTtl(keys.eventRate(clientIp(req)), RATE_WINDOW_SEC);
    if (count <= RATE_LIMIT) {
      await recordEvent(event, deviceId, userId, props);
    }
  }

  const res = NextResponse.json({ ok: true });
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
