// 문서 요청에서 (1) 로케일 쿠키 자동 감지, (2) device_id 쿠키 발급을 처리한다.
//
// device_id 를 여기서 심는 이유: 예전엔 /api/visit 과 /api/event 가 각자 "없으면 발급"했는데,
// 첫 방문에는 두 요청이 동시에 나가 서로 다른 UUID 를 발급했다. 같은 사람이 page_visits 와
// funnel_events 에 다른 ID 로 남아 퍼널 비율이 무의미해졌다(실측 겹침 7%).
// 문서 요청이 항상 수집 요청보다 먼저 오므로, 발급을 여기 하나로 모으면 두 테이블이 같은 ID 를 쓴다.
//
// 첫 방문 시 브라우저 언어를 감지해 로케일 쿠키를 심는다. 이미 쿠키가 있으면 사용자의 선택이므로 건드리지 않는다.
//
// ⚠️ 여기서 쿠키를 심어도 /regions 같은 정적 페이지는 여전히 정적 HTML(한국어)로 서빙된다 — 의도된 동작이다.
//    로케일이 실제로 적용되는 곳은 app/(intl)/ 아래뿐이다.
import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/i18n/config';
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, isValidDeviceId } from '@/lib/analytics/device';

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Accept-Language 를 q값 내림차순으로 훑어 지원 로케일과 첫 매칭을 찾는다.
 *  기본 서브태그만 본다: en-US→en, zh-CN/zh-TW→zh, ja-JP→ja.
 *  zh 는 간체만 제공하므로 zh-TW(번체) 사용자도 간체를 받는다 — 알려진 한계. */
function detectLocale(header: string | null): string {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((x) => x.tag && Number.isFinite(x.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function middleware(req: NextRequest) {
  // ── device_id: 없거나 형식이 깨졌을 때만 발급. 수집 라우트는 읽기만 한다.
  const did = req.cookies.get(DEVICE_COOKIE)?.value;
  const newDeviceId = isValidDeviceId(did) ? null : crypto.randomUUID();
  if (newDeviceId) {
    // 요청 쪽에도 반영 — 이 요청의 다운스트림(RSC 등)이 바로 볼 수 있게 한다(로케일과 같은 이유).
    req.cookies.set(DEVICE_COOKIE, newDeviceId);
  }

  const setDeviceCookie = (res: NextResponse): NextResponse => {
    if (newDeviceId) {
      res.cookies.set(DEVICE_COOKIE, newDeviceId, {
        path: '/',
        maxAge: DEVICE_COOKIE_MAX_AGE,
        sameSite: 'lax',
        httpOnly: true, // 클라이언트가 읽을 필요가 없다(서버가 식별한다)
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return res;
  };

  const existing = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(existing)) {
    return setDeviceCookie(
      newDeviceId ? NextResponse.next({ request: { headers: req.headers } }) : NextResponse.next(),
    );
  }

  const detected = detectLocale(req.headers.get('accept-language'));

  // 요청 쪽에도 반영해야 이번 응답(첫 렌더)부터 감지된 로케일로 나간다.
  // res.cookies 에만 쓰면 Set-Cookie 헤더는 나가지만, i18n/request.ts 의 cookies() 는
  // "요청"을 보므로 그 요청엔 아직 쿠키가 없어 이번 렌더는 DEFAULT_LOCALE(한국어)로 나가고,
  // 감지된 로케일은 다음 요청부터 반영된다 — 정확히 자동 감지가 막으려던 실패가 재현된다.
  // req.cookies.set() 은 RequestCookies 내부에서 req.headers 를 직접 mutate 하므로,
  // 그 mutate 된 headers 를 NextResponse.next({ request }) 로 넘기면 이번 요청의 다운스트림
  // 렌더(RSC의 cookies())가 감지된 값을 즉시 보게 된다.
  req.cookies.set(LOCALE_COOKIE, detected);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(LOCALE_COOKIE, detected, {
    maxAge: ONE_YEAR,
    sameSite: 'lax',
    path: '/',
    httpOnly: false, // 전환 UI가 클라이언트에서 읽고 쓴다
  });
  return setDeviceCookie(res);
}

export const config = {
  // API·정적 자산·이미지 최적화·파일 확장자가 있는 경로 제외.
  matcher: ['/((?!api|_next/static|_next/image|icons|favicon.ico|.*\\..*).*)'],
};
