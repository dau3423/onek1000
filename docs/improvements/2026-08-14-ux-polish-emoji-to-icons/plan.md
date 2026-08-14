# 기획서: 화면 UX 다듬기 + 이모지 아이콘 → 공용 SVG 아이콘 전면 교체

- 작성일: 2026-08-14 (기획 담당)
- 입력: `docs/improvements/2026-08-14-ux-polish-emoji-to-icons/research.md`, `docs/요구사항_명세서.md`(SRS)
- 다음 단계: ux-designer(아이콘 시각 사양·와이어프레임) → 구현 → QA

---

## 배경·목표

research.md 조사 결과, 사용자 화면에 렌더되는 이모지/문자 글리프가 **약 40개 파일·70여 지점**에 산재한다(A-1 표).
문제는 세 갈래다.

1. **렌더 품질**: 이모지·특수문자(🗗 ⛶ ✦ ← ✕ ♥ 등)는 OS/폰트에 따라 모양·굵기·정렬이 제각각이고,
   일부(전체화면 🗗/⛶)는 미지원 글리프(두부 문자)로 깨질 위험이 있다(A-3, B-1).
2. **접근성**: 대부분의 이모지가 텍스트 노드라 스크린리더가 "주유펌프 이모지"처럼 읽고,
   즐겨찾기 토글은 `aria-pressed` 없이 글리프(♥/♡)로만 상태를 표현한다(B-7, NFR-7 방향과 어긋남).
3. **조작성**: 뒤로가기/즐겨찾기 버튼이 36px(`h-9 w-9`)로, 코드베이스의 다른 주요 버튼(44px, `h-11`)보다
   작아 모바일 탭 타깃 권장치(44px)에 미달한다(B-1).

코드베이스에는 이미 인라인 SVG(stroke/fill=`currentColor`, viewBox 24) 패턴이 표준처럼 쓰이고 있고(A-5),
SRS §9·§10은 "불필요한 의존성 추가 없음"을 요구하므로, **의존성 없는 공용 인라인 SVG 아이콘 세트**를
신설해 교체하는 것이 결론이다.

> **이번 사이클이 끝나면**: 사용자는 어떤 기기·다크모드에서도 깨지지 않고 일관된 모양의 아이콘과,
> 44px 탭 타깃·스크린리더 대응이 된 뒤로가기/닫기/즐겨찾기 버튼을 쓰게 된다.

---

## 유저 스토리

- **모바일 사용자로서**, 기기와 무관하게 또렷하고 일관된 아이콘을 보고 싶다. 그래서 버튼이 무엇을
  하는지 한눈에 알아보고, 깨진 문자(□)를 마주치지 않는다.
- **엄지로 조작하는 운전자로서**, 뒤로가기·닫기·즐겨찾기 버튼을 한 번에 정확히 누르고 싶다.
  그래서 이동 중 짧은 조작에서도 오터치가 없다.
- **스크린리더 사용자로서**, 장식 아이콘은 읽히지 않고 기능 버튼은 상태("즐겨찾기 됨/안 됨")까지
  들리길 원한다. 그래서 화면을 보지 않고도 저장 여부를 알 수 있다.
- **다크모드 사용자로서**, 아이콘이 배경에 묻히지 않고 의미색(순위 금색, 경고색 등)이 유지되길 원한다.

---

## 기능 요구사항

### FR-1: 공용 SVG 아이콘 세트 도입 + 사용자 화면 이모지/글리프 전면 교체 (P0, 필수)

**설명**

`components/icons/`(신규)에 의존성 추가 없이 공용 인라인 SVG 아이콘 세트를 만들고,
research.md **A-1 표 전체**의 이모지/문자 글리프를 이 아이콘으로 교체한다.
라이선스 안전한 오픈소스 path(Lucide/Heroicons — MIT) 인라인 복사를 허용한다.

**아이콘 세트 공통 규격** (기존 패턴 A-5 준수 — 세부 시각 사양은 ux-designer 몫)

- `viewBox="0 0 24 24"`, `stroke`/`fill`은 `currentColor` 기반(색은 부모의 Tailwind text 클래스로 제어).
- 기본 `aria-hidden="true"`. 크기는 `className`(예: `h-5 w-5`)으로 지정.
- 파일 위치: `components/icons/`(단일 index 또는 아이콘별 파일 — 구현 재량). 서버 컴포넌트에서도
  import 가능해야 한다(`'use client'` 불필요한 순수 SVG).
- 필요 아이콘(예상 인벤토리, 이름은 구현 재량): back(←), close(✕), chevron-right(→/›), pin(📍),
  phone(📞/☎), clock(🕒), bolt(⚡), fuel(⛽), heart/heart-filled(♡/♥), star/star-half/star-outline(★/☆),
  crown(👑), warning(⚠), car(🚗), trend-up(📈), chart(📊), bell/bell-off(🔔/🔕), chat(💬), mail(✉️),
  phone-device(📱), camera(📷), pencil(✍️), check(✓/✅), x-circle(❌), gift(🎁), download/install(📲),
  road(🛣️), sparkle(✦), fullscreen/fullscreen-exit(⛶/🗗), location-off(🚫), loader(⏳), building(🏢),
  map(🗺️), settings(⚙️), celebration(🎉), card(💳), coin/money(💸/✨ — pricing 히어로 대체는 디자이너 결정).

**교체 대상 (A-1 표 전체) — 화면 그룹 4개로 구조화** (그룹 단위로 커밋/검증 가능해야 함)

- **G1. 메인 지도 + 공통 UI + 알림 배너**
  - `app/page.tsx`(🛣️ ✕ 🚫 ⏳ 🗗/⛶ ⛽토스트), `components/ui/Header.tsx`(⚙️),
    `components/ui/FilterBar.tsx`(⚡), `components/ui/BottomSheet.tsx`(👑 → ⚡),
    `components/ui/MarkerLegend.tsx`(👑), `components/map/KakaoMap.tsx`(TOP10 핀 ✦ — HTML 문자열 내이므로 마커 빌더 문자열에 SVG 마크업 삽입),
  - `components/alert/RadiusAlert.tsx`(⚠ ✕), `RouteAlert.tsx`(🚗 ✕ — **푸시 title의 이모지는 유지**, 42행), `PriceTrendBanner.tsx`(📈 ✕)
- **G2. 주유소 상세 + 리뷰 + EV 상세**
  - `app/station/[id]/page.tsx`(📍 📞 ☎), `app/station/[id]/not-found.tsx`(⛽ 일러스트),
    `components/FavoriteButton.tsx`(♥/♡), `components/station/FuelLogButton.tsx`(✓/⛽),
    `MyFuelLogsSection.tsx`(⚡/⛽), `FuelDwellPrompt.tsx`(⛽ ✕),
  - `components/reviews/ReviewSection.tsx`(✍️), `ReviewForm.tsx`(📍/✓ 5종, ✕, 📷), `StarRating.tsx`(★/☆),
  - `app/ev/[statId]/page.tsx`(⚡🏢📍📞🕒☎), `components/map/EvStationPopup.tsx`(⚡ ✕),
    `components/ev/EvChargeLogButton.tsx`(✓/⚡), `MyEvLogsSection.tsx`(⚡)
- **G3. 마이페이지 계열**
  - `app/my/page.tsx`(메뉴 아이콘 7종 + ←), `app/my/sections.tsx`(→),
    `app/my/{favorites,report,vehicles,fuel-logs,interest-regions}/page.tsx`(← ♡ →),
  - `components/profile/AlimtalkToggle.tsx`(💬 📱), `components/push/EnablePushButton.tsx`(🔔/🔕),
    `components/forecast/{ForecastNotifyToggle,ForecastCard,ForecastHistory}.tsx`(📈 ⛽ ✅/❌),
    `components/fuel/{FuelReport,FuelLogManager}.tsx`(📊 ⚡ ⛽ 🗺️ ›),
    `components/vehicle/VehicleManager.tsx`(🚗), `components/interest/InterestRegionManager.tsx`(📍 ✓),
    `components/pwa/{InstallButton,InstallBanner}.tsx`(📲), `components/referral/ReferralCard.tsx`(🎁)
- **G4. 결제·경로·검색·기타**
  - `app/pricing/page.tsx`(← 💸 ✨ ✓), `app/billing/success/page.tsx`(🎉), `app/billing/fail/page.tsx`(💳),
  - `app/route/page.tsx`(← ✕ 📍), `components/route/RouteLoginPrompt.tsx`(🛣️ 🔔 ⛽),
  - `app/search/page.tsx`(←), `components/common/BackButton.tsx`(←), `app/legal/layout.tsx`(←),
    `app/regions/[region]/page.tsx`·`[district]/page.tsx`(›), `components/ads/InterstitialAd.tsx`(⛽)

**기능적 글리프 — 상태 로직 보존 규칙** (A-3)

- **별점(★/☆, `StarRating.tsx`)**: filled/half/empty 3-상태를 SVG로 재현한다. 현재 half는
  `text-primary/60`(전체 별 반투명)으로 표현되는데, SVG 교체 시 **실제 반 채움**(clip/gradient fill)
  또는 최소한 현행과 동등한 시각 구분을 유지한다. `aria-label="${n}점"`·onChange·readOnly 동작 불변.
- **즐겨찾기(♥/♡, `FavoriteButton.tsx`)**: 토글 상태를 SVG fill로 표현(세부는 FR-2에서 규정).
- **GPS 버튼(🚫/⏳, `app/page.tsx:947-950`)**: denied/locating/기본(icon_gps.png) 3-상태 분기와
  기존 `aria-label`·`aria-pressed`·`title` 로직을 그대로 유지하고 글리프만 SVG로 교체.
  locating은 정적 아이콘 또는 회전 애니메이션(디자이너 결정) — 상태 구분이 시각적으로 남아야 한다.
- **전체화면(🗗/⛶, `app/page.tsx:1001`)**: isFullscreen 2-상태별로 서로 다른 SVG(진입/종료)를 렌더.
  `aria-pressed`·`title` 유지.
- **닫기(✕, 9곳)**: 전부 공용 CloseIcon 하나로 통일(FR-2와 연계).

**"📍 내 위치" 입력값 처리 방침** (`app/route/page.tsx:308`)

- 입력창 `value`는 **플레인 텍스트 "내 위치"**로 바꾼다(문자열 값에 이모지를 남기지 않는다).
- "내 위치가 선택됨"의 시각 구분이 필요하면 입력창 좌측 인라인 pin 아이콘(장식, `aria-hidden`)으로
  분리한다 — 채택 여부·형태는 ux-designer가 결정. 어느 쪽이든 검색어 타이핑 시 value 동기화 로직
  (`lastSyncedValue`)이 깨지지 않아야 한다.

**접근성 규칙 (전 그룹 공통)**

- **장식 아이콘**(인접 텍스트가 의미를 전달: 메뉴 라벨 옆 아이콘, 배너 라벨 아이콘, 일러스트 등):
  `aria-hidden="true"`. 스크린리더에 아무것도 읽히지 않는다.
- **의미 전달 아이콘**(아이콘 단독 버튼: 뒤로가기/닫기/즐겨찾기/GPS/전체화면 등):
  버튼에 한국어 `aria-label` 필수. 기존 aria-label이 있는 곳은 유지, 없는 곳(예: `app/search/page.tsx`
  뒤로가기)은 추가한다. 상태 토글은 `aria-pressed` 병기.
- 교체 후 어떤 이모지도 스크린리더에 "…이모지"로 읽히는 곳이 없어야 한다.

**다크모드·의미색 규칙**

- 기본은 `currentColor` — 부모 텍스트 색을 따르므로 기존 `dark:` variant가 자동 적용된다.
- 이모지가 고유색으로 의미를 전달하던 곳은 **색을 명시**한다:
  - 👑 전국 순위 배지/범례(`BottomSheet.tsx`, `MarkerLegend.tsx`): 금색 계열(예: `text-amber-400~500`),
    다크모드에서도 금색 유지.
  - ⚠ 반경 알람 배너: 현행 배너 색 톤과 조화되는 경고색 유지.
  - ✅/❌ 예보 적중/빗나감(`ForecastHistory.tsx`): 초록/빨강 의미색 유지.
  - ♥ 즐겨찾기 활성: FR-2 참조.
  - 구체 팔레트는 ux-designer가 확정하되, "의미색은 라이트/다크 양쪽에서 배경과 4.5:1 미만으로
    묻히지 않는다"를 기준으로 한다.

**레이아웃 시프트 방지 (이모지 크기 → SVG 크기 매핑 지침)**

- 이모지는 폰트 크기에 종속되므로, 교체 시 아래 매핑을 기본값으로 크기를 지정한다
  (1em ≈ 해당 text 크기): `text-sm`→16px(`h-4`), `text-base`→16~20px(`h-4`/`h-5`), `text-lg`→20px(`h-5`),
  `text-2xl`→24px(`h-6`), `text-4xl`→36px(`h-9`), `text-5xl`(빈 상태·결제 일러스트)→48px(`h-12`).
- 교체 전후로 버튼·토스트·빈 상태 카드의 높이가 달라지지 않아야 한다(QA 시각 확인 항목).

**교체 제외 (건드리지 않음)**

- A-2: `components/promo/WelcomePromo.tsx`(현재 미노출), `app/admin/**`(관리자 전용).
- A-4: 푸시 title(예: `RouteAlert.tsx:42`, `app/api/internal/*`, `lib/forecast/notify.ts`),
  SNS/블로그 콘텐츠 생성기(`lib/content/dailyTop10.ts`, `lib/daily-top10.ts`),
  관리자 카톡 메모(`lib/billing/confirm.ts`, `lib/kakao/adminMemo.ts`),
  OG 이미지(`app/opengraph-image.tsx`, `app/api/og/**`).
- 이미 SVG인 지도 마커 계열(`KakaoMap.tsx` 왕관, `lib/map/markerFace.ts`, `lib/map/evMarker.ts`) —
  단, TOP10 핀의 ✦ 장식 문자(`KakaoMap.tsx:634-635`)만은 교체 대상이다.

**수용 기준 (AC)** — "교체 완료" 판정 방법 포함

- **AC-1-1 (완료 판정 grep)**: 아래 명령이 **예외 목록 외 0건**이다.
  ```
  rg -nP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]|[★☆♥♡✕✦›⛶⛽☎←→]' app components \
    --glob '!app/admin/**' --glob '!components/promo/WelcomePromo.tsx' --glob '!app/api/**' \
    --glob '!app/opengraph-image.tsx'
  ```
  허용 예외: ① 코드 주석 안의 설명용 이모지, ② 푸시 payload 문자열(`RouteAlert.tsx`의 push title),
  ③ `lib/` 하위 비-UI 텍스트. 리뷰어는 grep 결과의 매 건이 이 3가지 중 하나임을 확인한다.
  **JSX 렌더 경로의 이모지/글리프는 예외 없이 0건**이어야 한다.
- **AC-1-2 (아이콘 세트)**: `components/icons/`가 존재하고, 모든 아이콘이 viewBox 24·`currentColor`·
  기본 `aria-hidden` 규격을 따르며, 신규 npm 의존성이 `package.json`에 추가되지 않는다.
- **AC-1-3 (그룹 단위 검증)**: G1~G4 각 그룹의 화면을 브라우저에서 열었을 때 해당 그룹의 모든
  아이콘이 SVG로 렌더되고(개발자도구에서 `<svg>` 확인 가능), 교체 전 대비 버튼/카드/토스트의
  크기·정렬이 달라지지 않는다. 그룹별로 독립 커밋·검증이 가능하다.
- **AC-1-4 (기능 글리프 상태 보존)**:
  - 별점: 리뷰 목록에서 4.5점짜리 리뷰가 "채운 별 4 + 반 별 1"로 구분 표시되고, 리뷰 작성 폼에서
    별을 탭하면 해당 점수로 선택된다.
  - GPS 버튼: 위치 권한 거부 시 차단 아이콘, 확인 중일 때 로딩 아이콘, 정상 시 기존 icon_gps.png가
    각각 표시되며 `title`/`aria-label` 문구는 현행과 동일하다.
  - 전체화면: 토글 시 진입/종료 아이콘이 서로 바뀐다.
- **AC-1-5 (경로 입력값)**: `/route`에서 "내 위치"를 선택하면 입력창에 이모지 없는 텍스트가 표시되고,
  이어서 다른 검색어를 타이핑·검색하는 흐름이 현행과 동일하게 동작한다.
- **AC-1-6 (접근성)**: 아이콘 단독 버튼(뒤로가기/닫기/즐겨찾기/GPS/전체화면/사진삭제 등) 전부에
  한국어 `aria-label`이 있고, 라벨 텍스트를 동반한 장식 아이콘은 전부 `aria-hidden="true"`다.
  (검증: 해당 버튼들 grep + 개발자도구 접근성 트리 확인)
- **AC-1-7 (다크모드)**: OS 다크모드에서 G1(지도·시트·배너) 아이콘이 배경에 묻히지 않고,
  순위 👑 대체 크라운은 금색으로 보인다.
- **AC-1-8 (빌드)**: `npm run typecheck`·`npm run lint`·`npm run build` 통과,
  Mock 모드(`NEXT_PUBLIC_USE_MOCK=true`)에서 G1~G4 화면이 키 없이 렌더된다.
  (외부 의존이 새로 생기지 않으므로 mock 폴백 추가 요구는 없음 — SRS §9 Mock 우선 원칙 충족)

---

### FR-2: 뒤로가기/닫기 공용화 + 탭 타깃 44px 정규화 + 즐겨찾기 접근성·시인성 (P1, 권장)

**설명**

FR-1과 같은 파일들을 만지므로 증분 비용이 가장 작다(research B-1, B-7).

- **뒤로가기 공용화**: 기존 `components/common/BackButton.tsx`를 SVG 아이콘 + 44px(`h-11 w-11`)로
  정리하고, 자체 구현 뒤로가기를 전부 이 컴포넌트로 수렴한다:
  `app/my/page.tsx`, `app/search/page.tsx`, `app/pricing/page.tsx`, `app/route/page.tsx`,
  `app/my/{favorites,report,vehicles,fuel-logs,interest-regions}/page.tsx`, `app/legal/layout.tsx`.
  - **동작 보존 주의**: 현재 `app/my/page.tsx`·`app/legal/layout.tsx`는 히스토리 back이 아니라
    **홈으로 가는 `<Link>`**다. 공용화 시 BackButton이 `href` prop(지정 시 Link 동작)을 지원하게
    하거나 동등한 방식으로 **기존 내비게이션 목적지를 바꾸지 않는다**. (`app/legal/layout.tsx`는
    서버 컴포넌트이므로 Link 모드가 서버에서도 렌더 가능해야 함)
- **닫기 공용화**: ✕ 9곳(경로 표시줄, 알림 배너 3종, FuelDwellPrompt, ReviewForm 사진 삭제,
  EvStationPopup, route 최근 목록 삭제 등)을 공용 CloseIcon(+ 필요 시 공용 닫기 버튼 스타일)으로
  통일한다. 닫기류 버튼도 시각 크기는 유지하되 **탭 영역 44px 이상**을 확보한다(패딩/히트 영역 확장).
  단, 배너·팝업 내부처럼 44px 확보가 레이아웃을 깨는 곳은 40px까지 허용하고 사유를 코드 주석으로 남긴다.
- **즐겨찾기 버튼**(`components/FavoriteButton.tsx`):
  - SVG 하트(활성=채움, 비활성=아웃라인), 활성 시 명시적 색(예: `text-red-500` 또는 `text-primary` —
    디자이너 확정)으로 시인성 개선. 현행은 색 클래스가 없어 채운 하트도 검정으로 보이는 문제 해결.
  - `aria-pressed={fav}` 추가, `aria-label`은 "즐겨찾기" 유지(상태는 aria-pressed로 전달).
  - 버튼 크기 `h-11 w-11`(44px)로 확대.

**수용 기준 (AC)**

- **AC-2-1**: `app/`·`components/` 사용자 화면에서 `←` 글리프를 직접 렌더하는 코드가 0건이고,
  위 나열 페이지 전부가 공용 BackButton(또는 그 Link 모드)을 사용한다.
  (검증: `rg -n '←' app components` 0건 + 각 페이지 import 확인)
- **AC-2-2 (목적지 불변)**: **각 페이지의 뒤로가기 목적지가 교체 전(현행 코드)과 동일하다.**
  판정 기준은 design.md §4-1 "페이지별 모드·목적지 매핑" 표(현행 실측)이며, 아래 매핑과
  일치해야 한다:
  - `/station/[id]`, `/ev/[statId]`: **히스토리 모드** — `router.back()`, 히스토리 없으면 `/` 폴백(현행 불변).
  - `/search`: **히스토리 모드** — 현행 `router.back()` 자체 구현을 BackButton으로 수렴하며,
    히스토리 없을 때 `/` 폴백을 **추가**하고(허용된 개선) `aria-label`을 **신규** 부여한다.
  - `/my`, `/pricing`, `/route`: **Link 모드 `href="/"`** — 현행 `<Link href="/">` 그대로,
    홈으로 이동(히스토리 back으로 바꾸지 않는다).
  - `/my/{favorites,report,vehicles,fuel-logs,interest-regions}`: **Link 모드 `href="/my"`** —
    현행 `<Link href="/my">` 그대로, 마이페이지 메인으로 이동.
  - `/legal/*`: **Link 모드 + 라벨** — 현행 텍스트 링크 형태 유지,
    `label="1000냥 주유소 홈으로"`로 홈 이동.

  QA는 각 페이지에서 뒤로가기를 탭했을 때 위 목적지로 이동함을 확인한다. `/search`의 폴백 추가와
  aria-label 신규 외에는 어떤 페이지도 목적지·이동 방식이 현행과 달라지지 않아야 한다.
- **AC-2-3**: 뒤로가기·즐겨찾기 버튼의 히트 영역이 44×44px 이상이다(개발자도구 측정).
  닫기류는 44px 원칙, 예외 허용 시에도 40px 이상이다.
- **AC-2-4**: 즐겨찾기 버튼이 저장 상태일 때 채워진 색상 하트로 표시되고 `aria-pressed="true"`,
  해제 시 아웃라인 하트 + `aria-pressed="false"`다. 탭 시 저장/해제 토글과 비로그인 로그인 유도
  동작은 현행과 동일하다.
- **AC-2-5**: `✕` 문자 글리프 렌더가 0건이고 전부 공용 CloseIcon이다(검증: `rg -n '✕' app components` 0건).

---

## 범위

**포함 (In)**

- FR-1: `components/icons/` 신설 + A-1 표 전체 교체(그룹 G1~G4), 기능 글리프 상태 보존,
  접근성/다크모드/레이아웃 시프트 규칙 적용.
- FR-2: BackButton/CloseIcon 공용화, 탭 타깃 44px 정규화, FavoriteButton 접근성·시인성.

**제외 (Out) — BACKLOG 이관 대상으로 표기**

| 항목 | 내용 | 미루는 이유 |
|---|---|---|
| B-2 | 다크모드 미적용 페이지 정합(상세/검색/마이/pricing에 `dark:` 부재, NFR-8) | 규모 큼 — 페이지 단위 분할해 별도 사이클 |
| B-3 | 검색 결과 유종 반영(`/api/search` B027 하드코딩) | 이번 주제(아이콘 UX)와 결이 다름 — API+화면 별도 사이클 |
| B-4 | 상세 가격 추이 유종 탭(B027 고정) | 동상 |
| B-5 | 셀프/등유 필터(SRS FR-1.3과 구현 괴리) | 동상 |
| B-6 | 1km 알람 임계값 설정(SRS FR-2.3 미완) | 니즈 규모 미검증 + 결이 다름 |
| A-2 | WelcomePromo(비활성)·관리자 화면 이모지 | 사용자 미노출 — 되살리거나 관리자 UX 사이클에서 |
| A-4 | 푸시 title·SNS 카피·카톡 메모·OG 이미지 이모지 | 비-UI 텍스트, 이모지가 오히려 유리(OS 렌더) |
| — | `public/icons/` PNG 에셋(Header 검색/프로필 등)의 SVG화 | 현재 정상 동작, 이번 범위는 "이모지/문자 글리프"로 한정 |

---

## 성공 지표 (사이클 후 확인)

1. **교체 완전성**: AC-1-1 grep이 허용 예외 외 0건(JSX 렌더 경로 0건).
2. **품질 게이트**: typecheck/lint/build 통과 + Mock 모드 렌더(SRS DoD 2·3).
3. **접근성 진전**: 아이콘 단독 버튼 aria-label 커버리지 100%, FavoriteButton `aria-pressed` 적용
   (NFR-7 WCAG 방향의 측정 가능한 한 걸음).
4. **조작성**: 뒤로가기/즐겨찾기 44px 달성(개발자도구 측정 스크린샷).
5. **회귀 없음**: 별점/GPS/전체화면/즐겨찾기/경로 입력 등 기능 글리프 5종의 상태 동작이 QA
  시나리오에서 현행과 동일.
6. (정성) 실기기(iOS Safari/Android Chrome)에서 🗗/⛶/✦ 깨짐 현상 소멸 — QA 단계에서 최소 1기기 확인.

---

## SRS 반영 제안 (제안만 — 직접 수정 금지)

- **§9 코딩 컨벤션에 아이콘 규칙 1줄 추가 제안**:
  "아이콘: `components/icons/` 공용 인라인 SVG(viewBox 24, currentColor, 기본 aria-hidden)를 사용한다.
  신규 UI에 이모지/문자 글리프를 아이콘 용도로 사용하지 않는다(푸시·SNS 등 비-UI 텍스트 제외)."
  — 재발 방지를 위해 필요.
- **NFR-7(접근성) 비고 갱신 제안**: 이번 사이클의 aria-label/aria-pressed 정비를 "진행 중 항목"으로
  기록하면 이후 WCAG AA 사이클의 기준선이 된다.
- 충돌 없음: FR-1/FR-2는 기존 SRS의 어떤 FR/NFR과도 충돌하지 않는다(FR-2.3 임계값 설정 미완 등
  기존 괴리는 이번 범위 밖으로 유지).

---

## 미해결/리스크

1. **[규모] FR-1은 약 40개 파일·70여 지점을 건드리는 대규모 기계적 변경**이다.
   - 완화: AC-1-3의 G1→G2→G3→G4 그룹 단위로 커밋·검증을 분할한다. 사이클 내 시간이 부족하면
     **G1·G2(사용 빈도 최상위: 지도/배너/상세)까지를 필수 완료선**으로 하고 G3·G4는 동일 AC로
     다음 사이클에 이월할 수 있다. 이월 시 AC-1-1 grep은 완료 그룹의 파일 범위로 한정해 판정한다.
2. **별점 반 채움 SVG 구현 난도**: half-fill(clip/gradient)이 브라우저별로 미세하게 다를 수 있다.
   현행(전체 별 60% 투명)과 "동등 이상 구분"이면 통과로 판정한다(AC-1-4).
3. **KakaoMap 마커 빌더 문자열(✦)**: HTML 문자열 안에 SVG 마크업을 넣는 작업이라 마커 렌더 회귀
   위험이 있다. 교체 후 TOP10 핀 애니메이션(반짝임)이 유지되는지 QA 확인 필요. 회귀 시 이 1건만
   보류(주석 명시)하고 예외 목록에 추가하는 탈출구를 허용한다.
4. **실기기 검증 한계**: "이모지 깨짐"은 정적 조사 기반 가설이다. 교체 자체가 근본 해결이므로
   구현엔 영향 없으나, 성공 지표 6번의 실기기 확인은 QA 가용 기기에 의존한다.
5. **레이아웃 시프트**: 크기 매핑 지침을 따르더라도 이모지의 시각적 무게(색·면적)와 SVG가 달라
   빈 상태 일러스트·pricing 히어로 등은 "달라 보일" 수 있다. 픽셀 동일이 아니라 **컨테이너
   크기·정렬 불변**(AC-1-3)을 판정 기준으로 한다. 시각 톤은 ux-designer 사양을 따른다.
6. **pricing 히어로(💸 ✨)·결제 결과(🎉 💳) 일러스트의 대체 아이콘 선정**: 단색 SVG로는 감성이
   떨어질 수 있다. 어떤 아이콘/구성으로 대체할지는 ux-designer 결정 사항(미해결)이며,
   기능 요건은 "이모지 문자 제거 + 크기 불변"까지다.
7. **BackButton 서버/클라이언트 이원화**: `app/legal/layout.tsx`는 서버 컴포넌트라 현행 Link를
   쓴다. 공용화 시 Link 모드(서버 렌더 가능)와 히스토리 모드('use client')의 구조 설계가 필요
   — 구현 재량이나 AC-2-2(목적지 불변)를 깨지 않아야 한다.
8. **[보정 이력] AC-2-2를 design.md §4-1 실측 매핑에 맞춰 보정함**: 초안의 "pricing/route는 히스토리
   back" 문구가 현행 코드(`<Link href="/">`)와 불일치해, 사용자 승인에 따라 **Link 모드 유지("목적지
   불변" 원칙)**로 다시 썼다(2026-08-14, 실행 페이즈 승인 시 확정).
