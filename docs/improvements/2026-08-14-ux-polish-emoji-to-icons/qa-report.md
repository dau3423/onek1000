# QA 리포트: 이모지/문자 글리프 → 공용 SVG 아이콘 전면 교체 (FR-1/FR-2)

- QA 일자: 2026-08-14
- 대상 브랜치: master
- 기준 문서: `plan.md`(AC 원본), `design.md`
- 변경 범위: 추적 소스 57개 + 신규 `components/icons/index.tsx`. (`probe_sub.mjs`·`.codex`·`tsconfig.tsbuildinfo`는 무관)

## 판정: 조건부 통과

정적 검증(typecheck/lint/build)·완료 판정 grep(AC-1-1/2-1/2-5)·서버 렌더 HTML 프로브·코드 근거가
전부 AC를 만족한다. **AC 실패 0건.** 단, **Chrome 브라우저 자동화가 환경상 불가**(브라우저 확장이
연결되지 않음)하여 클릭·토글·다크모드 시각·탭 타깃 픽셀 측정 등 **인터랙티브/시각 확인은 미수행**이다.
그래서 "통과"가 아닌 "조건부 통과"로 판정한다.

## 정적 검증

| 항목 | 명령 | 결과 |
|---|---|---|
| typecheck | `npm run typecheck` (tsc --noEmit) | 무오류 통과 |
| lint | `npm run lint` (next lint) | `No ESLint warnings or errors` |
| build | `npm run build` | 전 라우트 빌드 성공(에러 없음) |
| 의존성(AC-1-2) | `git diff HEAD -- package.json` | 변경 0 — 신규 npm 의존성 없음 |

## 완료 판정 grep

| AC | 명령 | 결과 |
|---|---|---|
| AC-1-1 | plan.md의 이모지/글리프 grep(예외 glob 적용) | 매치 전부 허용 예외 — **JSX 렌더 경로 0건** |
| AC-2-1 | `rg -n '←' app components` | 사용자 화면 0건 (`app/admin/forecast/page.tsx`만 매치 — 관리자, 범위 밖) |
| AC-2-5 | `rg -n '✕' app components` | 렌더 0건 (전부 코드 주석) |

AC-1-1 매치 분류: 대부분 코드/JSX 주석의 화살표(→)·설명용 글리프. 실제 payload 예외 2건 —
`components/referral/ReferralCard.tsx:62`(Web Share `text:` 문자열의 🎁, 허용 예외 ②),
`components/alert/RouteAlert.tsx:43`(푸시 `title:` 문자열의 🚗, 허용 예외 ②). 렌더 경로 잔재 없음.

## 아이콘 세트 규격 (AC-1-2)

`components/icons/index.tsx` 존재. 공통 래퍼 `Stroke`/`Fill` 모두 `viewBox="0 0 24 24"` +
`currentColor` + 기본 `aria-hidden="true"`, 기본 `className="h-5 w-5"`. 색은 내부 하드코딩 없이
부모 text-* 클래스로 제어. `'use client'` 없음(서버 컴포넌트 import 가능). 규격 준수.

## 서버 렌더 HTML 프로브 (dev 서버, NEXT_PUBLIC_USE_MOCK=true)

브라우저 자동화 불가로, dev 서버에 Node `fetch`로 직접 요청해 서버 렌더 HTML의 `<svg>` 개수와
이모지/글리프 잔재를 계측했다.

| 경로 | status | `<svg>` | 글리프 |
|---|---|---|---|
| `/` (G1) | 200 | 4 | 0 |
| `/pricing` (G4) | 200 | 11 | 0 |
| `/search` (G4) | 200 | 1 | 0 |
| `/legal/terms` (G4) | 200 | 1 | 0 |
| `/billing/fail` (G4) | 200 | 1 | 0 |
| `/regions/seoul` (G4) | 200 | 1 | 0 |
| `/route` (G4) | 200 | 0 | 0 |
| `/my` (G3) | 307 | - | - |
| `/billing/success` (G4) | 307 | - | - |
| `/station/A0010001` (G2) | 404 | - | - |
| `/ev/BEV*` (G2) | 404 | - | - |

- 프로브된 모든 화면에서 서버 렌더 HTML **이모지/글리프 잔재 0건**, SVG 렌더 확인.
- `/route`는 클라이언트 컴포넌트라 SSR 셸에 SVG가 없음(정상 — 실제 아이콘은 클라이언트 마운트 후 렌더).
- `/my`·`/billing/success`는 인증 리다이렉트(307)로 비로그인 curl 검증 불가.
- `/station/*`·`/ev/*`는 상세 페이지가 `queryStationDetailWithPriceFallback`로 **Supabase를 직접**
  조회(모의 계층 미경유)해 키/DB 없이 404 — **이번 사이클과 무관한 기존 데이터 계층 동작**이며
  글리프 이슈 아님. 리스크에 기록.

## 시나리오 결과 (AC별)

브라우저 자동화 미수행으로 아래는 **정적 검증 + 코드 근거 + 서버 렌더 프로브** 기반 판정이다.
표기: ✅ 코드/정적 근거로 충족 · ⚠ 코드상 충족이나 인터랙티브 확인 미수행.

| AC | 내용 | 판정 | 근거 |
|---|---|---|---|
| AC-1-1 | 완료 판정 grep 예외 외 0건 | ✅ | grep 결과 렌더 경로 0건(위) |
| AC-1-2 | 아이콘 세트 규격 + 의존성 0 | ✅ | index.tsx 규격 준수, package.json 불변 |
| AC-1-3 | G1~G4 화면 SVG 렌더 | ⚠ | 서버 프로브로 G1/G4 SVG 확인. G2·G3 인터랙티브/DB 화면은 브라우저 미수행 |
| AC-1-4 별점 | 4.5점 = 채운 4 + 반 1, 탭 선택 | ⚠ | `StarRating.tsx` half=overflow 클리핑 좌 50% 채움, onChange 보존 |
| AC-1-4 GPS | denied/locating/기본 3-상태 | ⚠ | `page.tsx` LocationOffIcon(red)/LoaderIcon(spin)/PNG 분기, aria-pressed·title 유지 |
| AC-1-4 전체화면 | 진입/종료 아이콘 스왑 | ⚠ | `page.tsx:1010` isFullscreen 분기 Fullscreen/FullscreenExit, aria-pressed·title 유지 |
| AC-1-5 | route "내 위치" 플레인 텍스트 + Pin | ⚠ | `route/page.tsx` value=`'내 위치'`, isMyLocation 시 좌측 PinIcon, lastSyncedValue 동기화 보존 |
| AC-1-6 | 아이콘 단독 버튼 aria-label + 장식 aria-hidden | ✅ | BackButton/Favorite/GPS/Fullscreen/Close/삭제 전부 aria-label, 아이콘 기본 aria-hidden |
| AC-1-7 | 다크모드 아이콘 시인성 + crown 금색 | ⚠ | `dark:` variant·CrownIcon 금색 클래스 코드상 존재. 실제 렌더 대비 미수행 |
| AC-2-1 | `←` 렌더 0 + 공용 BackButton 수렴 | ✅ | grep 0건, 대상 페이지 전부 BackButton 사용 |
| AC-2-2 | 뒤로가기 목적지 불변 | ✅ | 매핑 일치(아래) |
| AC-2-3 | 탭 타깃 44/40/28px | ✅ | 코드 측정(아래) |
| AC-2-4 | 즐겨찾기 채운 색 하트+aria-pressed=true / 아웃라인+false | ⚠ | `FavoriteButton` HeartFilled(red-500)/Heart(gray-500), aria-pressed={fav}, 토글 로직 보존 |
| AC-2-5 | `✕` 렌더 0 + 공용 CloseIcon | ✅ | grep 0건, CloseIcon 10곳 사용 |

### AC-2-2 목적지 매핑 (코드 확인 — plan §4-1 일치)

| 페이지 | 코드 | 기대 | 일치 |
|---|---|---|---|
| `/station/[id]`, `/ev/[statId]` | `<BackButton />` (히스토리 모드) | router.back + `/` 폴백 | ✅ |
| `/search` | `<BackButton ariaLabel="뒤로 가기" />` | 히스토리 + 폴백/aria 신규 | ✅ |
| `/my`, `/pricing`, `/route` | `<BackButton href="/" ariaLabel="홈으로" />` | Link `/` | ✅ |
| `/my/{favorites,report,vehicles,fuel-logs,interest-regions}` | `<BackButton href="/my" />` | Link `/my` | ✅ (5개 전부) |
| `/legal/*` | `<BackButton href="/" label="1000냥 주유소 홈으로" />` | Link + 라벨 | ✅ |

### AC-2-3 탭 타깃 (코드 측정)

| 버튼 | 클래스 | 크기 | 판정 |
|---|---|---|---|
| 뒤로가기(공용 ICON_BTN) | `h-11 w-11` | 44px | ✅ |
| 즐겨찾기 | `h-11 w-11` | 44px | ✅ |
| EvStationPopup 닫기 | `h-11 w-11` | 44px | ✅ |
| 배너 닫기(Radius/Route/PriceTrend) | `h-10 w-10` | 40px | ✅ (배너 예외, 주석 명시) |
| 리뷰 사진 삭제 | `h-7 w-7` | 28px | ✅ (64px 썸네일 내 예외, 주석 명시) |
| route 최근칩 삭제 | `h-7 w-7` | 28px | ✅ (칩 <40px 예외, 주석 명시) |
| 리뷰 입력 별 | `p-1` | - | 폼 폭 초과 회피 예외(주석 명시) |

## 콘솔 에러

브라우저 자동화 미수행으로 런타임 콘솔 확인 못 함. 정적 빌드 단계 경고/에러는 없음.

## 모바일·다크모드 확인 결과

브라우저 자동화 미수행으로 실제 뷰포트 리사이즈·OS 다크모드 시각 확인은 못 함.
코드상 다크모드 대응(`dark:` variant, CrownIcon 금색, GPS denied red-400 등)은 존재.

## 발견 문제 상세

이번 변경 범위에서 **AC를 위반하는 결함은 발견되지 않음.**

## 미해결/리스크

1. **[환경 — 검증 커버리지] Chrome 브라우저 자동화 미수행 (심각도: 중간, 방법론 한계)**
   - 브라우저 확장 미연결(`tabs_context_mcp`/`navigate` 3회 시도 모두 "extension is not connected")로
     인터랙티브 AC(별점 탭·즐겨찾기 토글·GPS 상태 전이·전체화면 스왑·다크모드 시각·픽셀 탭 타깃·
     콘솔 에러)를 실화면에서 확인하지 못함. 코드 근거로는 전부 충족.
   - 권장: 확장 연결 가능 환경에서 G2(주유소 상세/리뷰)·G3(마이) 인터랙션과 다크모드/모바일 뷰포트
     시각 회귀를 재확인.
2. **[기존 동작] `/station/*`·`/ev/*` 상세가 Mock 모드에서 404** — 상세 페이지가
   `queryStationDetailWithPriceFallback`로 Supabase를 직접 조회(모의 계층 미경유)해 DB 없이 not-found.
   이번 아이콘 사이클과 무관한 기존 데이터 계층 동작. G2 화면의 아이콘 렌더는 curl로 검증 불가
   (브라우저+DB 필요). 범위 밖 리스크로만 기록.
3. **[plan 리스크 #3 승계] KakaoMap TOP10 핀 ✦ → SVG 문자열 교체** — `SPARKLE_SVG_STRING`을
   `.top10-sparkle` span에 삽입, `globals.css`의 sparkle keyframes 유지(코드 확인). 실제 마커 렌더·
   반짝임 애니메이션은 카카오 지도 SDK(클라이언트) 필요로 브라우저 미수행 상태라 시각 미확인.
4. **[plan 리스크 #6 승계] pricing 히어로·결제 결과 일러스트 감성** — 단색 SVG 대체의 시각 톤은
   ux-designer 사양 판단 영역. 기능 요건(이모지 제거+크기 불변)은 충족.
