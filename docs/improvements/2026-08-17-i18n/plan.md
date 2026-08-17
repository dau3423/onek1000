# 다국어(i18n) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한국 체류 외국인·관광객이 쓰는 화면(지도·주유소/EV/세차장 상세·검색·경로·마이페이지·로그인)을 한국어/영어/중국어/일본어로 제공한다.

**Architecture:** URL에 로케일을 넣지 않고 `NEXT_LOCALE` 쿠키로 전환한다. 루트 레이아웃에서 쿠키를 읽으면 하위 전체가 동적 렌더링이 되어 `/regions` SSG 291페이지가 사라지므로, 번역 대상만 `app/(intl)/` 라우트 그룹으로 묶고 **그 그룹 레이아웃에서만** 쿠키를 읽는다. 라우트 그룹은 URL에 영향이 없어 주소는 전부 그대로다.

**Tech Stack:** Next.js 14.2.5 (App Router) · React 18.3.1 · TypeScript 5.5.3 · next-intl ^4.13.7

**Spec:** [spec.md](./spec.md)

## Global Constraints

- **지원 로케일은 정확히 4개**: `ko`(기본·폴백) / `en` / `zh`(간체) / `ja`. 쿠키 이름은 `NEXT_LOCALE`.
- **`/regions/*`의 SSG 291페이지를 유지한다.** 매 태스크의 `npm run build` 출력에서 `● /regions/[region]`과 `● /regions/[region]/[district]`가 남아 있는지 확인한다. 이 설계의 최대 리스크다.
- **URL은 하나도 바뀌지 않는다.** 라우트 그룹 `(intl)`은 경로에 나타나지 않는다.
- **번역 제외**: `app/admin/*`, `app/legal/*`, `app/billing/*`, `app/pricing/*`, `app/regions/*`. 이 경로는 한국어로 남는다.
- **DB 원본은 번역하지 않는다**: 주유소·충전소·세차장의 이름과 주소, 공지(`notices`), 사용자 리뷰 본문.
- **식별자는 절대 건드리지 않는다**: `SIDO_SLUG`(URL 슬러그), `SidoCode`·`BrandCode`·`ProductCode`(DB 값).
- **Next 14이므로 `cookies()`는 동기 함수다.** next-intl 공식 문서 예제는 Next 15 기준이라 `await cookies()`로 되어 있다 — 그대로 베끼지 말 것.
- **이 저장소에는 단위 테스트 러너가 없다**(scripts: dev/build/start/lint/typecheck만). 테스트 프레임워크 도입은 이 계획의 범위 밖이다. 각 태스크의 검증 게이트는 `npm run typecheck` → `npm run lint` → `npm run build`와, Task 2에서 만드는 `npm run i18n:check` / `npm run i18n:scan`이다.
- **커밋 메시지는 한국어**로, 왜 그렇게 했는지를 남긴다(기존 저장소 관례).

---

## 명세에서 바뀐 점 (구현 착수 전 확정)

명세 작성 이후 코드를 더 읽고 확인한 내용이다. **명세보다 이 절이 우선한다.**

**`types/station.ts`의 라벨 상수를 제거하지 않는다.** 명세는 "코드→라벨 매핑을 카탈로그로 옮기고 상수에는 코드만 남긴다"고 썼는데, 이는 틀렸다. `PRODUCT_LABEL`·`SIDO_NAME`은 번역 대상이 아닌 `/regions/*`(한국어 SSG)와 `lib/regions.ts`에서도 쓰인다. 상수를 없애면 그쪽이 깨진다.

대신 **상수는 한국어 원본으로 그대로 두고**, `(intl)` 안에서만 카탈로그를 통해 라벨을 얻는다(Task 3). 결과적으로 한국어 문구는 두 곳(상수·`ko.json`)에 존재하지만, 상수는 SSG 페이지의 원본이고 카탈로그는 번역 대상 화면의 원본이라 **역할이 다르다.** Task 3의 검증 단계에서 두 값이 일치하는지 스크립트로 확인한다.

---

## 파일 구조

**신규**

| 파일 | 책임 |
|---|---|
| `i18n/request.ts` | 쿠키에서 로케일을 읽어 next-intl에 메시지를 공급 |
| `i18n/config.ts` | 지원 로케일 목록·기본값·쿠키 이름 — 단일 출처 |
| `middleware.ts` | 첫 방문 시 `Accept-Language` 감지 → 쿠키 심기 |
| `messages/{ko,en,zh,ja}.json` | 메시지 카탈로그 |
| `app/(intl)/layout.tsx` | `force-dynamic` + `NextIntlClientProvider` |
| `components/i18n/HtmlLangSync.tsx` | `<html lang>`을 현재 로케일로 동기화 |
| `components/i18n/LocaleSwitcher.tsx` | 헤더 언어 전환 드롭다운 |
| `scripts/i18n-check.mjs` | `ko.json` 대비 나머지 로케일의 키 누락·잉여 검사 |
| `scripts/i18n-scan.mjs` | `(intl)` 안에 남은 하드코딩 한글 검사 |

**이동** (`git mv`, URL 불변)

```
app/page.tsx            → app/(intl)/page.tsx
app/search/             → app/(intl)/search/
app/route/              → app/(intl)/route/
app/station/            → app/(intl)/station/
app/ev/                 → app/(intl)/ev/
app/carwash/            → app/(intl)/carwash/
app/my/                 → app/(intl)/my/
app/auth/               → app/(intl)/auth/
```

**제자리 유지**: `app/layout.tsx`, `app/regions/`, `app/legal/`, `app/admin/`, `app/billing/`, `app/pricing/`, `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.tsx`, `app/twitter-image.tsx`

---

## Task 1: 인프라 — next-intl 설정 + `(intl)` 라우트 그룹

이 태스크가 끝나면 **화면은 전혀 바뀌지 않는다**(전부 한국어). 배선만 깔고 SSG가 살아있음을 확인하는 것이 목적이다.

**Files:**
- Create: `i18n/config.ts`, `i18n/request.ts`, `middleware.ts`, `messages/ko.json`, `messages/en.json`, `messages/zh.json`, `messages/ja.json`, `app/(intl)/layout.tsx`, `components/i18n/HtmlLangSync.tsx`
- Modify: `next.config.mjs`, `package.json`
- Move: 위 "이동" 표의 8개 경로

**Interfaces:**
- Produces: `LOCALES: readonly Locale[]`, `DEFAULT_LOCALE: Locale`, `LOCALE_COOKIE: string`, `isLocale(v: string): v is Locale`, `type Locale = 'ko' | 'en' | 'zh' | 'ja'` — 모두 `@/i18n/config`에서 export. 이후 모든 태스크가 이걸 쓴다.

- [ ] **Step 1: next-intl 설치**

```bash
npm install next-intl@^4.13.7
```

- [ ] **Step 2: 로케일 설정 단일 출처 작성**

Create `i18n/config.ts`:

```ts
// 지원 로케일 단일 출처 — 미들웨어·요청 설정·전환 UI·검증 스크립트가 모두 여기를 본다.
export const LOCALES = ['ko', 'en', 'zh', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

/** 감지 실패·미지원 언어의 폴백. 서비스 원본 언어. */
export const DEFAULT_LOCALE: Locale = 'ko';

/** 쿠키 이름. httpOnly 가 아니다 — 전환 UI가 클라이언트에서 써야 한다. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** 전환 UI 표기. 각 언어를 그 언어로 적는다 — 못 읽는 언어로 적힌 목록은 쓸모가 없다. */
export const LOCALE_LABEL: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  zh: '中文',
  ja: '日本語',
};

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
```

- [ ] **Step 3: 빈 메시지 카탈로그 4개 생성**

Create `messages/ko.json` (나머지 3개도 **같은 내용**으로 생성한다 — 아직 키가 없으므로 동일하다):

```json
{
  "common": {}
}
```

```bash
for l in en zh ja; do cp messages/ko.json "messages/$l.json"; done
```

- [ ] **Step 4: 요청 설정 작성**

Create `i18n/request.ts`:

```ts
// next-intl 요청 설정 — 쿠키에서 로케일을 읽어 메시지를 공급한다(URL 로케일 없음).
// ⚠️ Next 14 에서 cookies() 는 동기 함수다. 공식 문서 예제는 Next 15 기준이라 await 가 붙어 있다.
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './config';
import koMessages from '../messages/ko.json';

/** "a.b.c" 경로로 중첩 객체에서 문자열 하나를 꺼낸다. 없으면 undefined. */
function lookup(obj: unknown, path: string): string | undefined {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export default getRequestConfig(async () => {
  const raw = cookies().get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // 키가 없으면 **한국어 문구로 대체**한다. 키 문자열이나 빈 문자열이 화면에 노출되면 안 된다
    // (빈 문자열은 버튼 라벨이 사라져 키 노출보다 나쁘다).
    // 번역이 덜 된 상태로 배포돼도 화면이 깨지지 않게 하는 장치다.
    getMessageFallback: ({ key, namespace }) => {
      const path = namespace ? `${namespace}.${key}` : key;
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[i18n] 누락된 키: ${path} (locale=${locale}) → 한국어로 대체`);
      }
      // ko 에도 없으면 최후로 키의 마지막 조각(사람이 알아볼 수 있는 형태)을 쓴다.
      return lookup(koMessages, path) ?? path.split('.').pop() ?? path;
    },
    onError: (err) => {
      if (process.env.NODE_ENV === 'development') console.warn('[i18n]', err.message);
    },
  };
});
```

- [ ] **Step 5: next.config.mjs 에 플러그인 적용**

Modify `next.config.mjs` — 기존 `nextConfig` 객체는 그대로 두고 export만 감싼다:

```js
import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 't1.daumcdn.net' },
    ],
  },
};

// i18n/request.ts 를 요청 설정으로 등록한다(기본 탐색 경로).
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
```

- [ ] **Step 6: 미들웨어 작성 (Accept-Language 자동 감지)**

Create `middleware.ts`:

```ts
// 첫 방문 시 브라우저 언어를 감지해 로케일 쿠키를 심는다. 이미 쿠키가 있으면 사용자의 선택이므로 건드리지 않는다.
//
// ⚠️ 여기서 쿠키를 심어도 /regions 같은 정적 페이지는 여전히 정적 HTML(한국어)로 서빙된다 — 의도된 동작이다.
//    로케일이 실제로 적용되는 곳은 app/(intl)/ 아래뿐이다.
import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/i18n/config';

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
  const res = NextResponse.next();
  const existing = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(existing)) return res;

  const detected = detectLocale(req.headers.get('accept-language'));
  res.cookies.set(LOCALE_COOKIE, detected, {
    maxAge: ONE_YEAR,
    sameSite: 'lax',
    path: '/',
    httpOnly: false, // 전환 UI가 클라이언트에서 읽고 쓴다
  });
  return res;
}

export const config = {
  // API·정적 자산·이미지 최적화·파일 확장자가 있는 경로 제외.
  matcher: ['/((?!api|_next/static|_next/image|icons|favicon.ico|.*\\..*).*)'],
};
```

`LOCALES`는 이 파일에서 쓰지 않으므로 import 하지 않는다(미사용 import는 lint 오류다).

- [ ] **Step 7: `<html lang>` 동기화 컴포넌트 작성**

Create `components/i18n/HtmlLangSync.tsx`:

```tsx
'use client';

// <html lang> 은 정적 루트 레이아웃(app/layout.tsx)에 있어 서버에서 로케일별로 바꿀 수 없다.
// (바꾸려면 루트에서 쿠키를 읽어야 하고, 그러면 /regions SSG 291페이지가 사라진다.)
// 그래서 (intl) 트리에서만 클라이언트로 맞춘다. 스크린리더·브라우저 번역기 인식용이며,
// 한국어 SEO 페이지는 lang="ko" 로 남으므로 검색 영향이 없다.
import { useEffect } from 'react';
import { useLocale } from 'next-intl';

export function HtmlLangSync() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
```

- [ ] **Step 8: 페이지 8개를 `(intl)` 그룹으로 이동**

```bash
mkdir -p "app/(intl)"
git mv app/page.tsx "app/(intl)/page.tsx"
for d in search route station ev carwash my auth; do git mv "app/$d" "app/(intl)/$d"; done
git status --short
```

- [ ] **Step 9: `(intl)` 레이아웃 작성**

Create `app/(intl)/layout.tsx`:

```tsx
// 번역 대상 서브트리의 레이아웃 — 여기서만 로케일 쿠키를 읽는다.
//
// force-dynamic 인 이유: i18n/request.ts 가 cookies() 를 읽으므로 이 트리는 요청 시점에 렌더돼야 한다.
//   / · /search · /route 는 그전까지 정적 프리렌더였는데, 세 페이지 모두 데이터를 클라이언트에서
//   가져오므로 SSR 은 껍데기만 렌더한다. 이 대가로 서버가 첫 HTML 을 이미 해당 언어로 내보내
//   "한국어가 보였다가 바뀌는" 깜빡임이 사라진다.
//
// 루트 레이아웃(app/layout.tsx)에 두지 않는 이유: 루트에서 쿠키를 읽으면 하위 전체가 동적이 되어
//   /regions SSG 291페이지가 사라진다.
import { NextIntlClientProvider } from 'next-intl';
import { HtmlLangSync } from '@/components/i18n/HtmlLangSync';

export const dynamic = 'force-dynamic';

export default function IntlLayout({ children }: { children: React.ReactNode }) {
  // next-intl v4: 로케일·메시지는 i18n/request.ts 에서 자동으로 주입되므로 props 가 필요 없다.
  return (
    <NextIntlClientProvider>
      <HtmlLangSync />
      {children}
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 10: 타입·린트 통과 확인**

```bash
npm run typecheck && npm run lint
```

Expected: 둘 다 오류 0건. 이동한 디렉터리 안에 상대 경로 임포트(`../`, `./`)가 있었다면 여기서 깨진다 — `@/` 별칭으로 바꿔 고친다.

- [ ] **Step 11: 빌드해서 SSG 291개 생존 확인 (이 태스크의 핵심 검증)**

```bash
npm run build 2>&1 | tee /tmp/i18n-build.log
grep -E "^├ ● /regions" /tmp/i18n-build.log
grep -E "^├ ƒ /$|^├ ƒ /search|^├ ƒ /route" /tmp/i18n-build.log
```

Expected:
- `● /regions/[region]` 과 `● /regions/[region]/[district]` 가 **남아 있어야 한다**(SSG 유지).
- `/`, `/search`, `/route` 는 `○`(정적)에서 **`ƒ`(동적)으로 바뀌어 있어야 한다** — 의도된 변화다.
- 빌드 exit code 0.

이 중 하나라도 다르면 진행하지 말고 원인을 찾는다. `/regions`가 `ƒ`로 바뀌었다면 어딘가에서 루트 트리가 쿠키/헤더를 읽고 있다는 뜻이다.

- [ ] **Step 12: URL 이 하나도 안 바뀌었는지 확인**

```bash
npx next start -p 3480 &
sleep 6
for p in / /search /route /regions /regions/seoul /legal/terms /pricing; do
  printf "%-22s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3480$p")"
done
curl -s -o /dev/null -w "sitemap %{http_code}\n" http://localhost:3480/sitemap.xml
pkill -f "next start -p 3480"
```

Expected: 전부 200.

- [ ] **Step 13: 커밋**

```bash
git add -A
git commit -m "feat(i18n): next-intl 인프라 + (intl) 라우트 그룹 — 화면 변화 없음

쿠키 로케일 방식의 배선만 깐다. 아직 번역된 문자열이 없어 화면은 전부 한국어다.

- i18n/config.ts 지원 로케일 단일 출처(ko/en/zh/ja, 쿠키 NEXT_LOCALE)
- i18n/request.ts 쿠키에서 로케일을 읽어 메시지 공급. 누락 키는 조용히 폴백
  (키 문자열 노출 금지 — 번역이 덜 돼도 화면이 깨지지 않게)
- middleware.ts 첫 방문 시 Accept-Language 감지해 쿠키 심기
- app/(intl)/ 라우트 그룹으로 번역 대상 8개 경로 이동. URL 은 불변
- 루트 레이아웃이 아니라 (intl) 레이아웃에서만 쿠키를 읽는다 — 루트에서 읽으면
  /regions SSG 291페이지가 사라진다

/regions SSG 유지와 전 경로 200 을 빌드·실행으로 확인했다."
```

---

## Task 2: 검증 스크립트 (`i18n:check` · `i18n:scan`)

이후 모든 추출 태스크가 이 두 스크립트를 완료 판정에 쓴다. 그래서 먼저 만든다.

**Files:**
- Create: `scripts/i18n-check.mjs`, `scripts/i18n-scan.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `messages/*.json`(Task 1), `i18n/config.ts`의 `LOCALES`
- Produces: `npm run i18n:check`(키 일치 검사, 불일치 시 exit 1), `npm run i18n:scan`(하드코딩 한글 검사, 발견 시 exit 1)

- [ ] **Step 1: 키 일치 검사 스크립트 작성**

Create `scripts/i18n-check.mjs`:

```js
// ko.json 을 원본으로 삼아 나머지 로케일의 키 누락·잉여를 검사한다. 번역 완료 판정 기준.
// 값이 빈 문자열인 키도 "미번역"으로 잡는다 — 키만 만들어두고 번역을 안 채운 상태를 놓치지 않기 위해.
import { readFileSync } from 'node:fs';

// 로케일 목록은 i18n/config.ts 에서 파생한다 — 하드코딩하면 단일 출처가 둘로 갈린다.
// (.mjs 에서 .ts 를 import 할 수 없으므로 정규식으로 읽는다.)
const CONFIG_SRC = readFileSync(new URL('../i18n/config.ts', import.meta.url), 'utf8');
const LOCALES = [...(CONFIG_SRC.match(/export const LOCALES = \[([^\]]*)\]/)?.[1] ?? '')
  .matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
if (LOCALES.length === 0) {
  console.error('❌ i18n/config.ts 에서 LOCALES 를 읽지 못했다 — 검사기를 고칠 것');
  process.exit(1);
}
const BASE = 'ko';

const load = (l) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));

/** 중첩 객체를 "a.b.c" 평탄 키 맵으로 */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const base = flatten(load(BASE));
const baseKeys = Object.keys(base);
let failed = false;

console.log(`기준(${BASE}) 키: ${baseKeys.length}개\n`);

for (const locale of LOCALES.filter((l) => l !== BASE)) {
  const cur = flatten(load(locale));
  const missing = baseKeys.filter((k) => !(k in cur));
  const extra = Object.keys(cur).filter((k) => !(k in base));
  const empty = baseKeys.filter((k) => k in cur && String(cur[k]).trim() === '');

  const bad = missing.length + extra.length + empty.length;
  if (bad === 0) {
    console.log(`✅ ${locale}: 완료 (${baseKeys.length}/${baseKeys.length})`);
    continue;
  }
  failed = true;
  console.log(`❌ ${locale}: 누락 ${missing.length} · 잉여 ${extra.length} · 빈값 ${empty.length}`);
  for (const k of missing.slice(0, 20)) console.log(`   누락 ${k}`);
  for (const k of extra.slice(0, 20)) console.log(`   잉여 ${k}`);
  for (const k of empty.slice(0, 20)) console.log(`   빈값 ${k}`);
  if (bad > 60) console.log(`   … 외 ${bad - 60}건`);
}

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: 하드코딩 한글 검사 스크립트 작성**

Create `scripts/i18n-scan.mjs`:

```js
// app/(intl)/ 안에 남은 하드코딩 한글을 찾는다. 마이그레이션 완료 판정 기준.
// 주석은 한국어로 유지하는 게 이 저장소 관례이므로 주석 줄은 제외한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['app/(intl)'];
const HANGUL = /[가-힣]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

let total = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let inBlockComment = false;
    lines.forEach((line, i) => {
      const t = line.trim();
      if (inBlockComment) {
        if (t.includes('*/')) inBlockComment = false;
        return;
      }
      if (t.startsWith('/*')) { if (!t.includes('*/')) inBlockComment = true; return; }
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('{/*')) return;
      if (!HANGUL.test(line)) return;
      total++;
      if (total <= 40) console.log(`${file}:${i + 1}  ${t.slice(0, 100)}`);
    });
  }
}

if (total === 0) {
  console.log('✅ (intl) 안에 하드코딩 한글 없음');
  process.exit(0);
}
console.log(`\n❌ 하드코딩 한글 ${total}건${total > 40 ? ' (상위 40건만 표시)' : ''}`);
process.exit(1);
```

- [ ] **Step 3: npm 스크립트 등록**

Modify `package.json` — `scripts` 안에 두 줄 추가:

```json
    "i18n:check": "node scripts/i18n-check.mjs",
    "i18n:scan": "node scripts/i18n-scan.mjs",
```

- [ ] **Step 4: 두 스크립트가 실제로 동작하는지 확인**

```bash
npm run i18n:check
npm run i18n:scan
```

Expected:
- `i18n:check` → `✅ en/zh/ja: 완료 (0/0)` (아직 키가 없으므로 통과, exit 0)
- `i18n:scan` → **실패(exit 1)**. `(intl)` 안에 아직 한글이 잔뜩 있는 게 정상이다. 이 스크립트가 0건을 보고하면 오히려 스캐너가 고장 난 것이다.

- [ ] **Step 5: 스캐너가 거짓 통과하지 않는지 역검증**

```bash
npm run i18n:scan | tail -3
```

Expected: `❌ 하드코딩 한글 NNN건` 이고 NNN이 수백 단위. 숫자를 기록해 둔다 — 이후 태스크마다 이 숫자가 줄어드는 것으로 진척을 잰다.

- [ ] **Step 6: 커밋**

```bash
git add scripts/i18n-check.mjs scripts/i18n-scan.mjs package.json
git commit -m "chore(i18n): 검증 스크립트 2종 — 키 일치·하드코딩 한글 검사

문자열이 575개라 이 작업의 주된 실패 모드는 '빠뜨림'이다. 눈으로 세지 않도록 게이트를 만든다.

- i18n:check  ko.json 대비 en/zh/ja 의 누락·잉여·빈값 키. 번역 완료 판정 기준
- i18n:scan   app/(intl)/ 에 남은 하드코딩 한글. 마이그레이션 완료 판정 기준
              (주석은 한국어 유지가 관례라 제외)

지금은 i18n:scan 이 실패하는 게 정상이다 — 아직 추출 전이다."
```

---

## Task 3: 라벨 상수를 카탈로그로 (유종·브랜드·시도·세차 유형)

관광객 체감이 가장 큰 부분이다. **상수는 지우지 않는다** — 위 "명세에서 바뀐 점" 참조.

**Files:**
- Create: `lib/i18n/labels.ts`
- Modify: `messages/ko.json`(+en/zh/ja), `scripts/i18n-check.mjs`(라벨 정합성 검사 추가)

**Interfaces:**
- Consumes: `useTranslations`(next-intl), `types/station.ts`의 `ProductCode`·`BrandCode`·`SidoCode`, `types/carwash.ts`의 세차 유형
- Produces:
  - `useProductLabel(): (code: ProductCode) => string`
  - `useBrandLabel(): (code: BrandCode) => string`
  - `useSidoLabel(): (code: SidoCode) => string`
  - 서버용: `getProductLabel(t, code)` 형태가 아니라, 서버 컴포넌트는 `getTranslations('labels')` 후 `t(\`product.${code}\`)`를 직접 호출한다(훅을 서버에서 쓸 수 없으므로).

- [ ] **Step 1: `ko.json` 에 라벨 네임스페이스 추가**

Modify `messages/ko.json` — 값은 `types/station.ts` 의 현재 상수와 **글자 하나까지 같아야 한다**:

```json
{
  "common": {},
  "labels": {
    "product": {
      "B027": "휘발유",
      "B034": "고급휘발유",
      "D047": "경유",
      "K015": "실내등유",
      "C004": "LPG"
    },
    "brand": {
      "SKE": "SK에너지",
      "GSC": "GS칼텍스",
      "HDO": "현대오일뱅크",
      "SOL": "S-OIL",
      "RTE": "알뜰주유소",
      "RTO": "자영알뜰",
      "NHO": "NH-OIL",
      "E1G": "E1",
      "SOG": "SK가스",
      "ETC": "자영/기타",
      "EXP": "고속도로"
    },
    "sido": {
      "01": "서울", "02": "경기", "03": "강원", "04": "충북", "05": "충남",
      "06": "전북", "07": "전남", "08": "경북", "09": "경남", "10": "부산",
      "11": "제주", "14": "대구", "15": "인천", "16": "광주", "17": "대전",
      "18": "울산", "19": "세종"
    },
    "washType": {
      "self": "셀프세차",
      "hand": "손세차·디테일",
      "auto": "자동세차",
      "unknown": "유형 미확인"
    }
  }
}
```

- [ ] **Step 2: 영어 라벨 작성**

Modify `messages/en.json` — `labels` 블록을 아래로 채운다. 브랜드는 각 사의 공식 영문 표기를 쓴다:

```json
{
  "common": {},
  "labels": {
    "product": {
      "B027": "Gasoline",
      "B034": "Premium Gasoline",
      "D047": "Diesel",
      "K015": "Kerosene",
      "C004": "LPG"
    },
    "brand": {
      "SKE": "SK Energy",
      "GSC": "GS Caltex",
      "HDO": "HD Hyundai Oilbank",
      "SOL": "S-OIL",
      "RTE": "Alddle (Discount)",
      "RTO": "Alddle (Independent)",
      "NHO": "NH-OIL",
      "E1G": "E1",
      "SOG": "SK Gas",
      "ETC": "Independent / Other",
      "EXP": "Highway Rest Area"
    },
    "sido": {
      "01": "Seoul", "02": "Gyeonggi", "03": "Gangwon", "04": "Chungbuk", "05": "Chungnam",
      "06": "Jeonbuk", "07": "Jeonnam", "08": "Gyeongbuk", "09": "Gyeongnam", "10": "Busan",
      "11": "Jeju", "14": "Daegu", "15": "Incheon", "16": "Gwangju", "17": "Daejeon",
      "18": "Ulsan", "19": "Sejong"
    },
    "washType": {
      "self": "Self-service wash",
      "hand": "Hand wash / detailing",
      "auto": "Automatic wash",
      "unknown": "Type unknown"
    }
  }
}
```

- [ ] **Step 3: 중국어·일본어 라벨 작성**

Modify `messages/zh.json`:

```json
{
  "common": {},
  "labels": {
    "product": {
      "B027": "汽油",
      "B034": "高级汽油",
      "D047": "柴油",
      "K015": "煤油",
      "C004": "LPG"
    },
    "brand": {
      "SKE": "SK能源", "GSC": "GS加德士", "HDO": "现代Oilbank", "SOL": "S-OIL",
      "RTE": "Alddle平价加油站", "RTO": "自营平价", "NHO": "NH-OIL",
      "E1G": "E1", "SOG": "SK Gas", "ETC": "自营/其他", "EXP": "高速公路服务区"
    },
    "sido": {
      "01": "首尔", "02": "京畿", "03": "江原", "04": "忠北", "05": "忠南",
      "06": "全北", "07": "全南", "08": "庆北", "09": "庆南", "10": "釜山",
      "11": "济州", "14": "大邱", "15": "仁川", "16": "光州", "17": "大田",
      "18": "蔚山", "19": "世宗"
    },
    "washType": {
      "self": "自助洗车", "hand": "手工洗车・精洗", "auto": "自动洗车", "unknown": "类型未知"
    }
  }
}
```

Modify `messages/ja.json`:

```json
{
  "common": {},
  "labels": {
    "product": {
      "B027": "レギュラー",
      "B034": "ハイオク",
      "D047": "軽油",
      "K015": "灯油",
      "C004": "LPG"
    },
    "brand": {
      "SKE": "SKエナジー", "GSC": "GSカルテックス", "HDO": "現代オイルバンク", "SOL": "S-OIL",
      "RTE": "アルトゥル(格安)", "RTO": "自営アルトゥル", "NHO": "NH-OIL",
      "E1G": "E1", "SOG": "SKガス", "ETC": "自営・その他", "EXP": "高速道路SA"
    },
    "sido": {
      "01": "ソウル", "02": "京畿", "03": "江原", "04": "忠北", "05": "忠南",
      "06": "全北", "07": "全南", "08": "慶北", "09": "慶南", "10": "釜山",
      "11": "済州", "14": "大邱", "15": "仁川", "16": "光州", "17": "大田",
      "18": "蔚山", "19": "世宗"
    },
    "washType": {
      "self": "セルフ洗車", "hand": "手洗い・ディテール", "auto": "自動洗車", "unknown": "種別不明"
    }
  }
}
```

> ⚠️ zh/ja 브랜드·유종 표기는 초벌이다. 특히 `RTE`(알뜰주유소)는 한국 고유 제도라 정착된 외국어 표기가 없다. Task 10에서 검수 대상으로 표시한다.

- [ ] **Step 4: 라벨 훅 작성**

Create `lib/i18n/labels.ts`:

```ts
'use client';

// 코드 → 표시 라벨. 클라이언트 컴포넌트 전용 훅이다.
// 서버 컴포넌트에서는 getTranslations('labels') 후 t(`product.${code}`) 를 직접 호출한다.
//
// ⚠️ types/station.ts 의 PRODUCT_LABEL·BRAND_LABEL·SIDO_NAME 은 제거하지 않는다.
//    번역 대상이 아닌 /regions/*(한국어 SSG)와 lib/regions.ts 가 그 상수를 쓴다.
//    상수 = SSG 페이지의 한국어 원본, 카탈로그 = (intl) 화면의 원본. 역할이 다르다.
//    두 값의 일치는 scripts/i18n-check.mjs 가 검사한다.
import { useTranslations } from 'next-intl';
import type { ProductCode, BrandCode, SidoCode } from '@/types/station';
import type { WashType } from '@/types/carwash';

export function useProductLabel(): (code: ProductCode) => string {
  const t = useTranslations('labels.product');
  return (code) => t(code);
}

export function useBrandLabel(): (code: BrandCode) => string {
  const t = useTranslations('labels.brand');
  return (code) => t(code);
}

export function useSidoLabel(): (code: SidoCode) => string {
  const t = useTranslations('labels.sido');
  return (code) => t(code);
}

export function useWashTypeLabel(): (type: WashType) => string {
  const t = useTranslations('labels.washType');
  return (type) => t(type);
}
```

> **실측 확인됨**: `types/carwash.ts` 의 타입 이름은 `WashType`(`'self'|'hand'|'auto'|'unknown'`)이고, 기존 한국어 라벨은 같은 파일의 `WASH_TYPE_LABEL`(셀프세차 / 손세차·디테일 / 자동세차 / 유형 미확인)이다. 위 `labels.washType` 의 한국어는 **이 상수와 글자까지 같아야 한다** — 다르면 기존 화면 문구가 바뀌는 회귀다.
>
> 별개로 `FilterBar` 의 유형 세그먼트는 좁은 칩용 짧은 라벨(전체/셀프/손세차/자동)을 쓴다. 이건 `labels.washType` 과 **다른 문구 집합**이므로 Task 4 에서 `map.carwashFilter.{all,self,hand,auto}` 로 따로 만든다. 두 개를 합치지 말 것.

- [ ] **Step 5: 상수와 카탈로그 한국어가 일치하는지 검사 추가**

Modify `scripts/i18n-check.mjs` — 파일 맨 아래 `process.exit(...)` **앞에** 삽입:

```js
// ── 라벨 정합성: types/station.ts 상수와 ko.json labels 가 어긋나면 SSG 페이지와 (intl) 화면의
//    한국어 문구가 갈린다. 상수를 지우지 않기로 했으므로(계획 "명세에서 바뀐 점") 여기서 묶어 둔다.
{
  const src = readFileSync(new URL('../types/station.ts', import.meta.url), 'utf8');
  const block = (name) => {
    const m = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
    if (!m) return null;
    const out = {};
    // {2,4}: 시도 코드는 '01'~'19' 로 2자리다. {3,4} 로 두면 SIDO_NAME 을 한 건도 못 잡는다(실측 확인).
    for (const mm of m[1].matchAll(/'?([A-Z0-9]{2,4})'?\s*:\s*'([^']*)'/g)) out[mm[1]] = mm[2];
    return out;
  };
  const pairs = [
    ['PRODUCT_LABEL', 'labels.product'],
    ['BRAND_LABEL', 'labels.brand'],
    ['SIDO_NAME', 'labels.sido'],
  ];
  for (const [constName, ns] of pairs) {
    const consts = block(constName);
    if (!consts) { console.log(`⚠️  ${constName} 파싱 실패 — 검사 건너뜀`); continue; }
    for (const [code, val] of Object.entries(consts)) {
      const key = `${ns}.${code}`;
      if (base[key] !== val) {
        failed = true;
        console.log(`❌ 라벨 불일치 ${key}: 상수="${val}" ko.json="${base[key] ?? '(없음)'}"`);
      }
    }
  }
  if (!failed) console.log('✅ 상수 ↔ ko.json 라벨 일치');
}
```

`failed`가 `const`로 선언돼 있으면 `let`으로 바꾼다(Step 1의 스크립트는 이미 `let`이다).

- [ ] **Step 6: 검증**

```bash
npm run i18n:check && npm run typecheck && npm run lint
```

Expected: `✅ en/zh/ja: 완료`, `✅ 상수 ↔ ko.json 라벨 일치`, typecheck·lint 오류 0건.

- [ ] **Step 7: 일부러 깨뜨려 검사기가 실제로 잡는지 확인**

```bash
node -e "
const f='messages/en.json';const fs=require('fs');
const j=JSON.parse(fs.readFileSync(f));delete j.labels.product.B027;
fs.writeFileSync(f,JSON.stringify(j,null,2));"
npm run i18n:check; echo "exit=$?"
git checkout messages/en.json
npm run i18n:check > /dev/null && echo "복구 확인 OK"
```

Expected: 삭제 후 `❌ en: 누락 1 …` 과 `exit=1`, 복구 후 통과. 검사기가 통과만 하고 아무것도 못 잡는 상태를 방지한다.

- [ ] **Step 8: 커밋**

```bash
git add messages lib/i18n/labels.ts scripts/i18n-check.mjs
git commit -m "feat(i18n): 유종·브랜드·시도·세차유형 라벨 카탈로그 + 훅

관광객 체감이 가장 큰 부분이다(휘발유→Gasoline, 서울→Seoul).

- messages/*.json 에 labels 네임스페이스 4종 추가
- lib/i18n/labels.ts 클라이언트 훅. 서버 컴포넌트는 getTranslations('labels') 사용
- types/station.ts 의 상수는 **제거하지 않는다**. 번역 대상이 아닌 /regions/*(한국어 SSG)와
  lib/regions.ts 가 그 상수를 쓰기 때문이다. 상수=SSG 원본, 카탈로그=(intl) 원본으로 역할이 갈린다.
- 두 곳의 한국어가 갈리지 않도록 i18n:check 에 상수↔ko.json 일치 검사를 추가했다.

zh/ja 브랜드 표기는 초벌 — 특히 '알뜰주유소'는 한국 고유 제도라 정착된 외국어 표기가 없다."
```

---

## Task 4~9: 화면별 문자열 추출

여섯 태스크가 **같은 절차**를 서로 다른 파일 묶음에 적용한다. 절차를 여기 한 번 쓰고, 각 태스크는 대상 파일과 네임스페이스만 지정한다.

### 공통 절차 (매 태스크에서 그대로 수행)

- [ ] **Step A: 대상 파일의 한글 문자열 목록 뽑기**

```bash
npm run i18n:scan | grep -E '^<대상 경로>' | tee /tmp/i18n-target.txt
wc -l /tmp/i18n-target.txt
```

- [ ] **Step B: `messages/ko.json` 의 해당 네임스페이스에 키 추가**

키 이름 규칙:
- 네임스페이스는 화면 단위(`map`, `station`, `ev`, `carwash`, `search`, `route`, `my`, `auth`, `common`).
- 키는 **의미** 기반 소문자 카멜(`emptyResult`, `saveFuelLog`), 화면 문구 그대로가 아니다.
- 두 화면 이상에서 같은 뜻으로 쓰이면 `common` 으로 올린다(`close`, `save`, `retry`, `loading`, `cancel`).
- 변수는 next-intl ICU 문법으로: `"nearbyCount": "주변 주유소 {count}곳"`.

- [ ] **Step C: 컴포넌트에서 문자열을 `t()` 호출로 교체**

클라이언트 컴포넌트:

```tsx
import { useTranslations } from 'next-intl';

export function Example() {
  const t = useTranslations('map');
  return <button>{t('close')}</button>;
}
```

서버 컴포넌트:

```tsx
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('station');
  return <h1>{t('title')}</h1>;
}
```

`aria-label`·`title`·`alt`·`placeholder` 도 빠뜨리지 않는다 — 스크린리더 사용자에게는 이게 유일한 텍스트다.

- [ ] **Step D: en/zh/ja 에 같은 키를 추가하고 번역 채우기**

- [ ] **Step E: 게이트 통과 확인**

```bash
npm run i18n:check && npm run typecheck && npm run lint && npm run i18n:scan | tail -3
```

Expected: `i18n:check` 통과, typecheck·lint 오류 0건, `i18n:scan` 잔여 건수가 Step A에서 센 만큼 줄어 있음(아직 0은 아님 — 다른 태스크 몫이 남아 있다).

- [ ] **Step F: 4개 언어 화면 확인**

```bash
npx next dev -p 3481 &
sleep 20
for L in ko en zh ja; do
  curl -s -m 30 -b "NEXT_LOCALE=$L" http://localhost:3481<대상 경로> -o "/tmp/i18n-$L.html"
  echo "$L: $(grep -oE '[가-힣]+' /tmp/i18n-$L.html | sort -u | head -5 | tr '\n' ' ')"
done
pkill -f "next dev -p 3481"
```

Expected: `ko` 는 한글이 나오고, `en/zh/ja` 는 한글이 **DB 원본(주유소명·주소)만** 남아야 한다. UI 문구 한글이 보이면 그 문자열을 놓친 것이다.

- [ ] **Step G: 커밋** — `feat(i18n): <화면> 문자열 추출` 형식, 본문에 잔여 `i18n:scan` 건수를 적어 진척을 남긴다.

### Task 4: 지도·필터 (`map`)

**Files (modify):** `app/(intl)/page.tsx`, `components/ui/FilterBar.tsx`, `components/ui/BrandFilter.tsx`, `components/ui/MarkerLegend.tsx`, `components/ui/BottomSheet.tsx`, `components/ui/Header.tsx`, `components/map/KakaoMap.tsx`, `components/map/StationPopup.tsx`, `components/map/EvStationPopup.tsx`, `components/map/CarwashPopup.tsx`

가장 큰 묶음이다(`app/(intl)/page.tsx` 65건, `MarkerLegend` 53건, `KakaoMap` 46건). Task 3의 `useProductLabel`·`useBrandLabel`·`useWashTypeLabel` 을 여기서 처음 소비한다.

**주의**: `components/ui/Header.tsx` 는 `app/(intl)/page.tsx` 에서만 렌더되므로 `(intl)` 안에 있는 것과 같다. 하지만 파일 위치가 `components/` 라 `i18n:scan` 이 잡지 못한다 — 이 태스크에서 수동으로 포함한다. (Task 9에서 스캔 경로에 `components/` 를 추가한다.)

### Task 5: 주유소 상세 (`station`)

**Files (modify):** `app/(intl)/station/[id]/page.tsx`, `app/(intl)/station/[id]/not-found.tsx`, `components/station/*.tsx`, `components/reviews/*.tsx`, `components/charts/PriceHistoryChart.tsx`, `components/alert/NaviConfirm.tsx`, `components/alert/NaviApps.tsx`

**주의**: 리뷰 **본문**은 사용자가 쓴 한국어라 번역 대상이 아니다. 리뷰 **UI**(별점 라벨, "리뷰 쓰기", 정렬 옵션)만 추출한다.

### Task 6: EV·세차장 (`ev`, `carwash`)

**Files (modify):** `app/(intl)/ev/[statId]/page.tsx`, `app/(intl)/carwash/[id]/page.tsx`, `components/ev/*.tsx`, `components/carwash/*.tsx`

### Task 7: 검색·경로 (`search`, `route`)

**Files (modify):** `app/(intl)/search/page.tsx`, `app/(intl)/route/page.tsx`, `components/route/RouteLoginPrompt.tsx`

### Task 8: 마이페이지 (`my`)

**Files (modify):** `app/(intl)/my/**/*.tsx`, `components/fuel/*.tsx`, `components/vehicle/VehicleManager.tsx`, `components/interest/InterestRegionManager.tsx`, `components/profile/*.tsx`, `components/account/DeleteAccountButton.tsx`

### Task 9: 로그인 (`auth`) + 스캔 범위 확장

**Files (modify):** `app/(intl)/auth/**/*.tsx`, `scripts/i18n-scan.mjs`

- [ ] **추가 Step: 스캔 범위에 번역 대상 컴포넌트 포함**

Modify `scripts/i18n-scan.mjs` — `ROOTS` 를 교체하고 제외 목록을 둔다:

```js
const ROOTS = ['app/(intl)', 'components'];
// components/ 아래 번역 대상이 아닌 것 — 관리자·법정고지·결제·광고·계측.
const EXCLUDE = [
  'components/admin/', 'components/legal/', 'components/billing/',
  'components/promo/', 'components/referral/', 'components/ads/',
  'components/forecast/', 'components/notice/',
];
```

`walk` 결과를 순회하기 전에 `if (EXCLUDE.some((e) => file.startsWith(e))) continue;` 를 넣는다.

> `components/forecast/`·`components/notice/` 를 제외하는 이유: 유가 예보 카드와 공지 팝업은 DB/모델이 생성한 한국어 본문을 그대로 노출하는 화면이라, UI 문구만 번역해도 본문이 한국어로 남는다. 별도 판단이 필요하므로 이번 범위에서 뺀다.

> **스캐너 거짓양성 수정은 Task 2 에서 이미 처리됐다**(Ruling R12, 원장 참조). Task 2 리뷰에서
> 여러 줄 `{/* */}` JSX 주석 2번째 줄 이후(32건)와 코드 뒤 `//` 한국어 주석(18건)이 하드코딩
> 문자열로 잡혀 **0건 게이트에 도달할 수 없다는 것**이 드러나, Task 2 의 fix round 에서 고쳤다.
> 한국어 주석은 이 저장소 집 스타일이라 제거 대상이 아니기 때문이다.
> 이 태스크는 스캐너의 **범위**(`ROOTS`·`EXCLUDE`)만 넓힌다 — 주석 처리 로직은 손대지 않는다.

- [ ] **최종 Step: 스캔 0건 달성 확인**

```bash
npm run i18n:scan
```

Expected: `✅ (intl) 안에 하드코딩 한글 없음`, exit 0.

---

## Task 10: 언어 전환 UI (헤더)

**Files:**
- Create: `components/i18n/LocaleSwitcher.tsx`
- Modify: `components/ui/Header.tsx`, `messages/*.json`

**Interfaces:**
- Consumes: `LOCALES`·`LOCALE_LABEL`·`LOCALE_COOKIE`(`@/i18n/config`), `useLocale`·`useTranslations`(next-intl)
- Produces: `<LocaleSwitcher />`

> 프로필(`/my`)에는 넣지 않는다. `/my` 는 미로그인 시 로그인 페이지로 리다이렉트되므로(`app/(intl)/my/page.tsx`), 거기에만 두면 자동 감지가 어긋난 비로그인 사용자가 되돌릴 방법이 없다 — 로그인하려면 그 로그인 화면부터 못 읽는 언어로 떠 있다.

- [ ] **Step 1: 전환 컴포넌트 작성**

Create `components/i18n/LocaleSwitcher.tsx`:

```tsx
'use client';

// 헤더 언어 전환. 쿠키를 갱신하고 router.refresh() 로 서버 컴포넌트를 새 언어로 다시 렌더한다.
// (intl) 레이아웃이 force-dynamic 이라 refresh 하면 서버가 새 로케일로 HTML 을 다시 만든다.
//
// 쿠키를 직접 쓰는 이유: NEXT_LOCALE 은 httpOnly 가 아니고(미들웨어에서 그렇게 설정했다),
// 서버 액션 없이 한 줄로 끝난다.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LOCALES, LOCALE_LABEL, LOCALE_COOKIE, type Locale } from '@/i18n/config';
import { GlobeIcon } from '@/components/icons';
import clsx from 'clsx';

const ONE_YEAR = 60 * 60 * 24 * 365;

export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    setOpen(false);
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('changeLanguage')}
        title={t('changeLanguage')}
        className="tap-press flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100"
      >
        <GlobeIcon className="h-[26px] w-[26px] text-gray-700" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('changeLanguage')}
          className="absolute right-0 top-12 z-50 w-32 rounded-xl border border-gray-100 bg-white p-1 shadow-lg"
        >
          {LOCALES.map((l) => (
            <button
              key={l}
              role="menuitemradio"
              aria-checked={l === locale}
              onClick={() => select(l)}
              className={clsx(
                'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition',
                l === locale ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              {/* 각 언어를 그 언어로 표기한다 — 못 읽는 언어로 적힌 목록은 쓸모가 없다. */}
              {LOCALE_LABEL[l]}
              {l === locale && (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `GlobeIcon` 추가**

Modify `components/icons/index.tsx` — **이 파일의 관례를 따른다**(실측 확인: `IconProps` 타입 + `Stroke` 래퍼):

```tsx
export function GlobeIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </Stroke>
  );
}
```

`Stroke` 는 이 파일 안의 비공개 헬퍼로 `viewBox`·`fill="none"`·`stroke="currentColor"` 를 이미 붙여 준다. `MapIcon`(약 375줄)을 참고 구현으로 삼되, 그 아이콘 자체는 건드리지 않는다.

- [ ] **Step 3: 헤더에 배치**

Modify `components/ui/Header.tsx` — 검색 링크 **앞**에 넣는다(언어 → 검색 → 경로 → 프로필):

```tsx
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
```

`<div className="flex shrink-0 items-center gap-1">` 안, 관리자 배지 다음 줄에 `<LocaleSwitcher />` 를 추가한다.

- [ ] **Step 4: 문구 키 추가**

`messages/*.json` 의 `common` 에 추가 — ko: `"changeLanguage": "언어 변경"`, en: `"Change language"`, zh: `"更改语言"`, ja: `"言語を変更"`.

- [ ] **Step 5: 헤더 폭 회귀 확인 (아이콘이 4개가 된다)**

현재 헤더 아이콘은 3개(검색·경로·프로필, 각 48px)다. 언어 아이콘이 붙어 4개가 된다.

**전례**: `3c1d88f` 에서 지역 아이콘을 넣어 4개로 만들었더니 360px 에서 앱 이름이 "1000냥 주..."로 잘렸다. 버튼 폭을 48→44px 로 줄여 해결했으나, 이후 그 아이콘을 제거하며 48px 로 되돌렸다. **같은 문제가 재현될 것이므로 이 단계를 건너뛰지 말 것.**

```bash
npx next dev -p 3482 &
sleep 20
# CDP 스크린샷(브라우저 확장은 이 앱 페이지에 스크립트를 주입하지 못한다)
node scripts/i18n-shot.mjs "http://localhost:3482/" /tmp/hdr-360.png 360 80
pkill -f "next dev -p 3482"
```

`scripts/i18n-shot.mjs` 가 없으면 이 단계는 브라우저에서 360px 로 직접 확인한다. 이름이 잘리면 관리자 배지처럼 `hidden sm:inline` 을 쓰거나 아이콘 폭을 40px 로 줄인다 — **44px 미만으로 줄일 때는 터치 타깃 기준을 깨는 것이므로 사용자에게 알린다.**

- [ ] **Step 6: 전환이 실제로 동작하는지 확인**

```bash
npx next dev -p 3482 &
sleep 20
for L in ko en zh ja; do
  echo "$L: $(curl -s -m 30 -b "NEXT_LOCALE=$L" http://localhost:3482/ | grep -oE '<title>[^<]*' | head -1)"
done
pkill -f "next dev -p 3482"
```

Expected: 로케일마다 다른 문구가 나온다.

- [ ] **Step 7: 게이트 + 커밋**

```bash
npm run i18n:check && npm run typecheck && npm run lint && npm run build
git add -A
git commit -m "feat(i18n): 헤더 언어 전환 UI

프로필이 아니라 헤더에 둔다 — /my 는 미로그인 시 로그인 페이지로 리다이렉트되므로
프로필에만 두면 자동 감지가 어긋난 비로그인 사용자가 되돌릴 방법이 없다.
로그인하려면 그 로그인 화면부터 못 읽는 언어로 떠 있다.

- 목록은 각 언어를 그 언어로 표기(한국어/English/中文/日本語)
- 쿠키 갱신 후 router.refresh() 로 서버 컴포넌트를 새 언어로 재렌더
  ((intl) 레이아웃이 force-dynamic 이라 가능)"
```

---

## Task 11: 감지 언어 계측

**Files:**
- Modify: `middleware.ts`, `components/i18n/HtmlLangSync.tsx`(또는 새 계측 컴포넌트)

**Interfaces:**
- Consumes: `track()`(`@/lib/analytics`), `useLocale`(next-intl)

미들웨어는 엣지 런타임이라 기존 클라이언트 계측(`lib/analytics`)을 호출할 수 없다. 대신 **클라이언트에서 현재 로케일을 세션당 1회** 보낸다.

- [ ] **Step 1: 계측 추가**

Modify `components/i18n/HtmlLangSync.tsx` — `useEffect` 에 이어 붙인다:

```tsx
  // 감지·선택된 로케일을 세션당 1회 계측한다. 실제 방문자 언어권 분포가 쌓이면
  // 4개 언어 유지가 맞는지, 어디에 번역 품질을 더 쏟을지 데이터로 판단할 수 있다.
  useEffect(() => {
    const KEY = 'locale_tracked';
    if (sessionStorage.getItem(KEY) === locale) return;
    sessionStorage.setItem(KEY, locale);
    track('locale_active', { locale });
  }, [locale]);
```

`track` 의 실제 시그니처를 `lib/analytics.ts` 에서 확인해 맞춘다. 두 번째 인자를 받지 않으면 `track(\`locale_active_${locale}\`)` 형태로 바꾼다.

- [ ] **Step 2: 게이트 + 커밋**

```bash
npm run typecheck && npm run lint
git add -A
git commit -m "feat(i18n): 활성 로케일 계측 — 다음 언어를 데이터로 결정하기 위해"
```

---

## Task 12: 번역 검수 요청 + 마무리

- [ ] **Step 1: 전체 게이트**

```bash
npm run i18n:check && npm run i18n:scan && npm run typecheck && npm run lint && npm run build
```

Expected: 전부 통과, 빌드 exit 0.

- [ ] **Step 2: `/regions` SSG 최종 확인**

```bash
npm run build 2>&1 | grep -E "^├ ● /regions"
```

Expected: `● /regions/[region]`, `● /regions/[region]/[district]` 둘 다 존재. **없으면 이 계획의 핵심 제약이 깨진 것이므로 배포하지 않는다.**

- [ ] **Step 3: 4개 언어 주요 화면 스크린샷**

`/`, `/station/<임의 id>`, `/search`, `/my` 를 4개 언어로 캡처해 문구 잘림·줄바꿈 깨짐을 본다. 독일어처럼 긴 언어는 없지만, **영어는 한국어보다 대체로 길어 버튼·칩이 넘칠 수 있다.**

- [ ] **Step 4: 검수 요청 문서 작성**

Create `docs/improvements/2026-08-17-i18n/translation-review.md` — zh/ja 중 확신이 낮은 항목을 표로 정리한다. 최소 포함:

| 키 | ko | zh | ja | 왜 확신이 낮은가 |
|---|---|---|---|---|
| `labels.brand.RTE` | 알뜰주유소 | Alddle平价加油站 | アルトゥル(格安) | 한국 고유 제도라 정착된 외국어 표기가 없다 |
| `labels.brand.RTO` | 자영알뜰 | 自营平价 | 自営アルトゥル | 위와 같음 |
| `labels.product.B034` | 고급휘발유 | 高级汽油 | ハイオク | ja 는 일본 통용어를 썼다 — 직역(高級ガソリン)보다 자연스럽지만 확인 필요 |

- [ ] **Step 5: 커밋 + 사용자 보고**

사용자에게 **명시적으로 알린다**: zh/ja 번역은 초벌이며 검수 없이 배포하면 어색한 문구가 노출된다. 검수 전 배포 여부는 사용자가 결정한다.

---

## Self-Review 결과

**명세 커버리지** — 전 항목이 태스크에 매핑된다:

| 명세 항목 | 태스크 |
|---|---|
| next-intl 쿠키 모드 | Task 1 |
| `(intl)` 라우트 그룹 + SSG 보존 | Task 1 (Step 11이 검증) |
| 미들웨어 Accept-Language 감지 | Task 1 |
| 폴백(키 노출 금지) | Task 1 Step 4 |
| 카탈로그 네임스페이스 | Task 3~9 |
| 라벨 상수 이전 | Task 3 (**명세 수정**: 상수 유지) |
| DB 원본 미번역 | Global Constraints + Task 5 주의 |
| `<html lang>` 동기화 | Task 1 Step 7 |
| 헤더 전환 UI | Task 10 |
| 계측 | Task 11 |
| `i18n:check` / `i18n:scan` | Task 2 (Task 9에서 범위 확장) |
| 숫자·날짜 포맷 | **미할당** — 아래 참조 |

**미할당 항목**: 명세의 "숫자·날짜는 `Intl` 포매터" 는 별도 태스크로 두지 않았다. 가격·날짜 표시는 화면마다 흩어져 있어 각 추출 태스크(4~9)에서 해당 화면을 만질 때 함께 바꾸는 편이 자연스럽다. **각 태스크 Step C 수행 시 날짜·가격 포맷도 함께 확인할 것.**

**타입 일관성** — `Locale`·`LOCALES`·`LOCALE_COOKIE`·`LOCALE_LABEL`·`isLocale` 은 Task 1에서 정의되어 Task 10·11에서 같은 이름으로 소비된다. 훅 이름 `useProductLabel`/`useBrandLabel`/`useSidoLabel`/`useWashTypeLabel` 은 Task 3에서 정의되어 Task 4에서 소비된다.

**확인이 필요한 미해결 사항** (실행자가 착수 시 코드에서 확인할 것):
- ~~`lib/analytics.ts` 의 `track()` 시그니처~~ — **확인됨**: `track(event: string, props?: Record<string, unknown>)`. 계획대로 두 번째 인자를 쓴다.
- ~~`components/icons/index.tsx` 의 아이콘 props 관례~~ — **확인됨**: `({ className }: IconProps)` 시그니처에 `<Stroke className={className}>` 래퍼를 쓴다. Task 10 Step 2 의 GlobeIcon 도 이 형식을 따를 것.
