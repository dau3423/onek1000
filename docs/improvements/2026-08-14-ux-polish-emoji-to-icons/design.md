# 디자인 명세: 이모지/문자 글리프 → 공용 인라인 SVG 아이콘 전면 교체 + 뒤로가기·닫기·즐겨찾기 정규화

- 작성일: 2026-08-14 (UI/UX 디자인 담당)
- 입력: `plan.md`(FR-1/FR-2), `research.md`(A-1 인벤토리), `docs/04_화면설계.md`, 실코드 확인
  (`components/ui/FilterBar.tsx`·`app/page.tsx`의 기존 인라인 SVG 패턴, `tailwind.config.ts` 토큰)
- 원칙: **새 의존성 금지(인라인 SVG)** · **픽셀 동일이 아니라 컨테이너 크기·정렬 불변** · 기존 룩앤필 유지

---

## 화면 흐름 (사용자 진입 → 행동 → 결과)

이번 사이클은 **화면 흐름을 바꾸지 않는다**. 모든 진입점·행동·결과는 현행과 동일하고,
"보이는 글리프"와 "탭 타깃 크기·접근성"만 달라진다. 그룹별로 사용자가 체감하는 변화는 다음과 같다.

### G1. 메인 지도 (진입: `/`)
1. 사용자가 지도에 진입 → 우측 상단에 전체화면(⛶→ Maximize SVG)·범례(기존 ⓘ SVG 유지) 버튼,
   우측 하단에 GPS 버튼이 보인다.
2. GPS 탭 → 권한 거부면 위치차단 아이콘(MapPinOff, 빨강), 확인 중이면 회전 로더(Loader),
   정상이면 기존 `icon_gps.png` — 3-상태가 모양으로 구분된다(기존 title/aria 문구 동일).
3. 전체화면 탭 → 아이콘이 Maximize ↔ Minimize로 토글된다(`aria-pressed` 유지).
4. 경로 모드 진입 시 상단 표시줄 좌측에 Route 아이콘, 우측 닫기는 공용 CloseIcon(히트영역 확대).
5. 알림 배너(반경/경로/추세) 등장 → 라벨 아이콘(Warning/Car/TrendUp)이 SVG로, 닫기는 공용 CloseIcon.
6. 하단 시트 전국 TOP10 배지의 👑, 범례의 👑 → 금색 Crown SVG. 지도 TOP10 핀의 ✦ → Sparkle SVG(반짝임 애니메이션 유지).

### G2. 주유소/EV 상세 (진입: 시트·검색·즐겨찾기 → `/station/[id]`, `/ev/[statId]`)
1. 상세 진입 → 헤더 좌측 공용 BackButton(44px), 우측 FavoriteButton(44px).
2. 즐겨찾기 탭 → 채워진 빨간 하트 + `aria-pressed="true"`. 해제 → 아웃라인 하트. (비로그인 로그인 유도 동일)
3. 주소/전화/운영시간 라벨 → Pin/Phone/Clock SVG. 전화걸기 CTA의 ☎ → Phone SVG.
4. 리뷰 작성 → 별점이 SVG 별(탭 선택 동일), 지오펜스 안내 5종은 Pin/Check SVG, 사진 추가는 Camera,
   사진 삭제는 공용 CloseIcon(썸네일 내 예외 크기).
5. 목록의 4.5점 리뷰 → "채운 별 4 + **실제 반 채움** 별 1"로 표시된다.

### G3. 마이페이지 계열 (진입: 헤더 프로필 → `/my` 및 서브)
1. `/my` 진입 → 헤더 BackButton(홈 Link 모드, 44px). 메뉴 행 좌측 아이콘 7종이 SVG로 통일.
2. 서브 페이지(`favorites/report/vehicles/fuel-logs/interest-regions`) → BackButton(`/my` Link 모드).
3. "보기 →"류 텍스트 화살표 → ChevronRight SVG. 빈 상태 일러스트(♡/⛽/🗺️/📊) → 대형 회색 SVG(높이 불변).
4. 푸시/알림톡/예보 토글 → Bell·BellOff/Chat·Smartphone/TrendUp SVG, 예보 적중·빗나감은 초록/빨강 의미색 유지.

### G4. 결제·경로·검색·기타
1. `/pricing` 진입 → BackButton(홈 Link 모드). 히어로 💸 → 주황 Coins SVG(컨테이너 높이 불변),
   표의 ✓/✨ → Check/Sparkles SVG.
2. `/billing/success|fail` → PartyPopper/CreditCard 대형 SVG(48px, 높이 불변).
3. `/route` → "내 위치" 선택 시 입력창 값은 **플레인 텍스트 "내 위치"** + 좌측 인라인 Pin 아이콘(장식).
   다른 검색어 타이핑을 시작하면 Pin이 사라지고 일반 입력 상태로 복귀(검색 흐름 동일).
4. `/search` → BackButton(히스토리 모드, aria-label 신규 추가). `/legal` → BackButton 라벨 모드("1000냥 주유소 홈으로").
5. `/regions` 브레드크럼 `›` → 작은 ChevronRight(장식, aria-hidden).

---

## 1. 공용 아이콘 세트 — 시각 사양

### 1-1. 아이콘 API 권고안: **개별 네임드 컴포넌트** (단일 `<Icon name>` 디스패처 비권고)

```tsx
// 사용 예 (명세 — 실제 코드는 구현 단계에서)
<BackIcon className="h-6 w-6" />
<HeartFilledIcon className="h-6 w-6 text-red-500" />
```

- **형태**: `components/icons/index.tsx`(단일 파일)에 `BackIcon`, `CloseIcon`, … 개별 export.
  파일이 커지면(35종+) `components/icons/` 하위 분할 + index 재export는 구현 재량.
- **`<Icon name="...">` 디스패처를 쓰지 않는 이유**:
  1. 기존 코드 톤이 "그 자리에서 인라인 SVG를 직접 렌더"(FilterBar 셰브런·체크, page.tsx ⓘ)라
     명시적 컴포넌트가 더 자연스럽다.
  2. name 문자열 오타를 타입으로 못 잡는 디스패처보다 import 단위 타입 안전·grep 용이·트리셰이킹에 유리.
  3. 서버 컴포넌트 호환: 순수 SVG 함수 컴포넌트(`'use client'` 불필요)로 두면 어디서든 import 가능.
- **공통 규격** (AC-1-2):
  - `viewBox="0 0 24 24"`.
  - stroke형: `fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"`.
    (기존 코드가 2~2.4를 혼용 — **기본 2로 통일**, 12~14px 초소형 사용처만 2.4 허용)
  - fill형(하트 채움·별 채움·왕관·스파클): `fill="currentColor" stroke="none"`.
  - props: `{ className?: string }`만 받는다. 기본 `className="h-5 w-5"`, 기본 `aria-hidden="true"` 하드코딩.
    색·크기는 전부 부모/자기 `className`의 Tailwind로 제어(`currentColor` 상속).
  - 의미 전달이 필요한 경우 아이콘이 아니라 **감싸는 button/링크에 `aria-label`**을 단다(아이콘은 항상 hidden).

### 1-2. 라이선스 안전 확보 근거

- **Heroicons**: MIT (Tailwind Labs). **Lucide**: ISC (MIT와 동등한 허용 범위의 퍼미시브 라이선스).
  둘 다 path 데이터의 복사·수정·재배포를 허용하며 소스 고지만 요구한다.
- 조치: `components/icons/index.tsx` **파일 상단 주석에 출처·라이선스 고지 1블록**을 남긴다
  (예: "Icon paths adapted from Lucide (ISC) and Heroicons (MIT)"). npm 의존성은 추가하지 않는다
  — path 문자열만 인라인 복사하므로 `package.json` 불변(AC-1-2).
- 기본 소스는 **Lucide**(24 viewBox·stroke 2·currentColor로 우리 규격과 정확히 일치),
  채움(solid) 변형이 필요한 것만 Heroicons solid 또는 Lucide path에 fill 적용.

### 1-3. 아이콘 인벤토리 매핑 표

크기 표기: `h-N w-N`(px). "기본"은 가장 흔한 사용 크기이며 사용처별 크기는 §6 표를 따른다.

| 컴포넌트명 | 대체 글리프 | 소스 아이콘 | 방식 | 기본 크기 | 주요 사용처 |
|---|---|---|---|---|---|
| `BackIcon` | ← | Lucide `arrow-left` | stroke | h-6 (24) | 공용 BackButton |
| `CloseIcon` | ✕ | Lucide `x` | stroke | h-5 (20) | 배너·팝업·표시줄 닫기 9곳 |
| `ChevronRightIcon` | → › | Lucide `chevron-right` | stroke | h-4 (16) | "보기 →"·"상세 →"·브레드크럼·행 셰브런 |
| `PinIcon` | 📍 | Lucide `map-pin` | stroke | h-4 (16) | 주소 라벨·관심지역·지오펜스·route 내위치 |
| `PhoneIcon` | 📞 ☎ | Lucide `phone` | stroke | h-4 (16) | 전화 라벨·전화걸기 CTA |
| `ClockIcon` | 🕒 | Lucide `clock` | stroke | h-4 (16) | EV 운영시간 |
| `BoltIcon` | ⚡ | Lucide `zap` | stroke | h-3.5 (14) | EV 칩·급속 배지·충전 기록 |
| `BoltFilledIcon` | ⚡(배지 강조) | Lucide `zap` + fill | fill | h-3.5 (14) | BottomSheet EV "급속" 배지 등 초소형 |
| `FuelIcon` | ⛽ | Lucide `fuel` | stroke | h-4 (16) | 주유 기록·토스트·빈 상태·404 |
| `HeartIcon` | ♡ | Lucide `heart` | stroke | h-6 (24) | FavoriteButton 비활성·메뉴 라벨 |
| `HeartFilledIcon` | ♥ | Heroicons solid `heart` | fill | h-6 (24) | FavoriteButton 활성 |
| `StarFilledIcon` | ★ | Heroicons solid `star` | fill | h-6 (24) | 별점 채움 |
| `StarOutlineIcon` | ☆ | Heroicons outline `star` | stroke | h-6 (24) | 별점 빈 별 |
| (반 별: 합성) | ★(60% 투명) | 위 2개 오버레이 | — | h-6 (24) | §3-1 참조 (별도 아이콘 파일 아님) |
| `CrownIcon` | 👑 | Lucide `crown` + fill (또는 KakaoMap 기존 왕관 path 재사용) | fill | h-3 (12) | TOP10 배지·범례 |
| `WarningIcon` | ⚠ | Lucide `triangle-alert` | stroke | h-3.5 (14) | RadiusAlert 라벨 |
| `CarIcon` | 🚗 | Lucide `car` | stroke | h-4 (16) | RouteAlert 라벨·차량 카드 |
| `TrendUpIcon` | 📈 | Lucide `trending-up` | stroke | h-4 (16) | 추세 배너·예보 토글 |
| `ChartIcon` | 📊 | Lucide `chart-column` | stroke | h-4 (16) | 리포트 메뉴·리포트 빈 상태(h-12) |
| `BellIcon` / `BellOffIcon` | 🔔 / 🔕 | Lucide `bell` / `bell-off` | stroke | h-4 (16) | 푸시 토글·로그인 유도 혜택 |
| `ChatIcon` | 💬 | Lucide `message-circle` | stroke | h-4 (16) | 알림톡 라벨 |
| `MailIcon` | ✉️ | Lucide `mail` | stroke | h-4 (16) | 마이 메뉴(문의) |
| `SmartphoneIcon` | 📱 | Lucide `smartphone` | stroke | h-4 (16) | 휴대폰 번호 설정 라벨 |
| `CameraIcon` | 📷 | Lucide `camera` | stroke | h-4 (16) | 리뷰 사진 추가 |
| `PencilIcon` | ✍️ | Lucide `square-pen` | stroke | h-4 (16) | 리뷰 쓰기 버튼 |
| `CheckIcon` | ✓ | Lucide `check` | stroke | h-4 (16) | 완료 상태·pricing 표·현재위치 버튼 |
| `CheckCircleIcon` | ✅ | Lucide `circle-check` | stroke | h-4 (16) | 예보 "적중" 배지 |
| `XCircleIcon` | ❌ | Lucide `circle-x` | stroke | h-4 (16) | 예보 "빗나감" 배지 |
| `GiftIcon` | 🎁 | Lucide `gift` | stroke | h-4 (16) | 친구 추천 카드 |
| `InstallIcon` | 📲 | Lucide `download`(트레이+↓) | stroke | h-4 (16) | PWA 설치 버튼/배너 |
| `RouteIcon` | 🛣️ | Lucide `route`(두 지점+점선 경로) | stroke | h-4 (16) | 경로 표시줄·로그인 유도 혜택 |
| `SparkleIcon` | ✦ | Lucide `sparkle`(단일) + fill | fill | h-3 (12) | TOP10 핀 반짝이(HTML 문자열, §3-5) |
| `SparklesIcon` | ✨ | Lucide `sparkles` | stroke | h-4 (16) | pricing 표 헤더 "광고 차단" |
| `FullscreenIcon` | ⛶ | Lucide `maximize` | stroke | h-5 (20) | 전체화면 진입 |
| `FullscreenExitIcon` | 🗗 | Lucide `minimize` | stroke | h-5 (20) | 전체화면 종료 |
| `LocationOffIcon` | 🚫(GPS 거부) | Lucide `map-pin-off` | stroke | h-5 (20) | GPS 버튼 denied 상태 |
| `LoaderIcon` | ⏳ | Lucide `loader-circle`(호弧) | stroke | h-5 (20) | GPS locating (`animate-spin`) |
| `BuildingIcon` | 🏢 | Lucide `building-2` | stroke | h-4 (16) | EV 운영기관 라벨 |
| `MapIcon` | 🗺️ | Lucide `map` | stroke | h-4 (16) | 기록 관리 빈 상태(h-9)·지도 링크 |
| `SettingsIcon` | ⚙️ | Lucide `settings` | stroke | h-4 (16) | Header 관리자 배지 |
| `CelebrationIcon` | 🎉 | Lucide `party-popper` | stroke | h-12 (48) | 결제 성공 일러스트 |
| `CardIcon` | 💳 | Lucide `credit-card` | stroke | h-12 (48) | 결제 실패 일러스트 |
| `CoinIcon` | 💸 | Lucide `coins` | stroke | h-9 (36) | pricing 히어로 |

> 표에 없는 잔여 글리프: `✗`(pricing 표) → `CloseIcon h-4`, 메뉴 `⛽⚡` 복합 라벨 →
> `FuelIcon`+`BoltIcon` 나란히(gap-1), "출발 → 도착"의 `→` → `ChevronRightIcon h-3 inline`(§6 G1).

### 1-4. 이모지 크기 → SVG 크기 매핑 (레이아웃 시프트 방지)

이모지 글리프 박스 높이 = 해당 텍스트의 line-height. **교체 후에도 그 줄 박스 높이가 유지**되도록
아래 매핑을 기본값으로 한다.

| 원본 텍스트 크기 | 글리프 박스(line-height) | SVG 클래스 | 비고 |
|---|---|---|---|
| `text-[10px]`~`text-[11px]` 배지 | 12~14px | `h-3 w-3` (12) | 👑 배지·✦ 등 초소형. strokeWidth 2.4 허용 |
| `text-xs` | 16px | `h-3.5 w-3.5` (14) | 칩·배지 안 아이콘(⚡ 등) |
| `text-sm` | 20px | `h-4 w-4` (16) | 라벨·메뉴 행·CTA 안 아이콘 — **가장 흔한 케이스** |
| `text-base` | 24px | `h-4`~`h-5` | 문장 내 인라인은 h-4, 단독 강조는 h-5 |
| `text-lg` (GPS/전체화면 버튼) | 28px | `h-5 w-5` (20) | 버튼이 flex-center라 줄 박스 무관 — 컨테이너 44px 불변 |
| `text-2xl` (별점 md) | 32px | `h-6 w-6` (24) | 별점 버튼은 §3-1의 크기 표 별도 적용 |
| `text-4xl` (히어로·인터스티셜) | **40px** | `h-9 w-9` (36) + **래퍼를 `flex h-10 items-center justify-center`로** | text-4xl 줄 박스는 40px — SVG만 넣으면 4px 줄어들므로 래퍼로 40px 고정 |
| `text-5xl` (빈 상태·결제 일러스트) | 48px (lh 1) | `h-12 w-12` (48) | 1:1이라 래퍼 불필요 |

- 인라인(문장 속) 아이콘은 `inline-block align-[-0.125em]`(또는 `-mt-0.5` + flex 정렬)로 베이스라인을 맞춘다.
  라벨 행이 이미 `flex items-center`면 정렬 클래스 불필요 — **기존 flex 구조를 우선 활용**한다.
- QA 판정: 교체 전후 버튼/카드/토스트/빈 상태 블록의 **박스 높이 동일**(개발자도구 측정, AC-1-3).

---

## 2. 의미색 팔레트 (라이트/다크)

`currentColor` 상속이 기본이고, 이모지가 고유색으로 의미를 전달하던 곳만 아래 색을 명시한다.
장식 아이콘은 그래픽 대비 3:1, 텍스트를 대신하는 상태 표시는 인접 텍스트 기준 4.5:1을 지향한다.

| 의미 | 대상 | 라이트 | 다크 | 근거 |
|---|---|---|---|---|
| 순위 금색 | Crown (MarkerLegend 범례, 단독 노출) | `text-amber-600` | `dark:text-amber-400` | amber-500는 흰 배경 대비 ~2.2:1로 미달 → **600**(≈3.3:1). 다크는 400(≈9:1) |
| 순위 금색(배지 내) | Crown (BottomSheet 앰버 그라데이션 배지 안) | 색 미지정(`currentColor` = 기존 `text-amber-950` 상속) | 동일 | 배지 자체가 금색 — 왕관은 진한 앰버 실루엣이 대비 최적 |
| 경고 | Warning (RadiusAlert — 초록 `bg-cheap` 배너 위) | 색 미지정(`currentColor` = 흰색 상속) | 동일 | 배너가 이미 의미색. 흰 아이콘이 대비 최대 |
| 적중(성공) | CheckCircleIcon (ForecastHistory) | `text-green-600` | `dark:text-green-400` | 흰 배경 4.5:1 근접(≈3.9:1, 인접 텍스트 병기로 보완) |
| 빗나감(실패) | XCircleIcon (ForecastHistory) | `text-red-500` | `dark:text-red-400` | 기존 빨강 의미 유지 |
| 즐겨찾기 활성 | HeartFilledIcon | `text-red-500` | `dark:text-red-400` | 하트=빨강 관습. `text-primary`(주황)는 브랜드 CTA와 혼동 → 빨강 채택 |
| 즐겨찾기 비활성 | HeartIcon | `text-gray-500` | `dark:text-gray-400` | 현행 검정보다 한 단계 연하게(비활성 표현), 3:1 이상 |
| 별점 채움/반 | StarFilledIcon | `text-primary` (#FF6B00) | 동일 | 현행 유지(브랜드 일관) |
| 별점 빈 별 | StarOutlineIcon | `text-gray-300` | `dark:text-gray-600` | 현행 유지 + 다크 보정 |
| GPS 거부 | LocationOffIcon | `text-red-500` | `dark:text-red-400` | "차단됨" 의미. 흰 칩 배경 위(§3-3) |
| GPS 로딩 | LoaderIcon | `text-gray-600` | `dark:text-gray-300` | 중립 상태 |
| pricing 히어로 | CoinIcon | `text-primary` | 동일(다크 미지원 페이지, B-2 범위 외) | 💸 초록 대신 브랜드 주황 — 히어로 그라데이션(primary/10)과 톤 일치 |
| 결제 성공/실패 | Celebration / Card | `text-primary` / `text-gray-400` | 동일(B-2 범위 외) | 성공=브랜드 축하, 실패=중립(빨강은 에러 텍스트에 양보) |
| 빈 상태 일러스트 | Fuel/Heart/Chart/Map 대형 | `text-gray-300` | `dark:text-gray-600`(다크 지원 화면만) | 일러스트는 저채도 — 본문 텍스트가 주인공 |

그 외 전부: 색 클래스 없이 부모 텍스트 색 상속(기존 `dark:` variant 자동 적용).
다크모드 미지원 페이지(my/search/station/pricing — B-2로 이관됨)는 라이트 값만 지정하고 `dark:`를 추가하지 않는다
(페이지 전체가 라이트 고정이므로 아이콘만 다크 대응하면 오히려 안 보임).

---

## 3. 기능 글리프 — 상태 디자인

### 3-1. 별점 (StarRating) — 반 채움은 "오버레이 클리핑" 방식 권고

```
filled        half                      empty
┌─────┐   ┌──────────┐             ┌─────┐
│ ★  │   │ ★▌+ ☆  │  (좌 50%만  │ ☆  │
└─────┘   └──────────┘   채움 별)  └─────┘
```

- **구현 방식 권고: 오버레이 클리핑** — 버튼 내부를 `relative`로 두고,
  ① 바닥: `StarOutlineIcon`(`text-gray-300 dark:text-gray-600`),
  ② 위: `absolute inset-0 w-1/2 overflow-hidden` 래퍼 안에 `StarFilledIcon`(`text-primary`).
  - SVG `<defs>`의 `linearGradient`/`clipPath` id 방식은 같은 화면에 별이 다수 렌더될 때 id 충돌·
    Safari 캐시 이슈가 있어 **CSS 클리핑이 더 안전**하다(브라우저 편차 없음).
- 3-상태: filled = `StarFilledIcon text-primary` / half = 위 합성 / empty = `StarOutlineIcon text-gray-300`.
  현행 "전체 별 60% 투명"보다 구분이 명확해진다(AC-1-4 "동등 이상").
- 크기 매핑(기존 SIZES 대체): `sm(text-base)` → `h-4 w-4`, `md(text-2xl)` → `h-6 w-6`, `lg(text-4xl)` → `h-9 w-9`.
- 입력 모드: 버튼 요소·`aria-label="${n}점"`·onChange·`hover:scale-110` 트랜지션 전부 현행 유지.
  탭 타깃: 입력용(리뷰 폼, md/lg)은 버튼에 `p-1` 추가로 별 간 실탭 영역 32px+ 확보(별 5개 가로 나열이라
  44px 강제 시 폼 폭 초과 — 인접 타깃 간 간격으로 보완, 예외 사유 주석).

### 3-2. 즐겨찾기 토글 (FavoriteButton) — §5-3 참조

- 비활성: `HeartIcon h-6 w-6 text-gray-500 dark:text-gray-400` (아웃라인).
- 활성: `HeartFilledIcon h-6 w-6 text-red-500 dark:text-red-400` (채움).
- 상태 전환에 `transition-colors` + 활성 진입 시 `scale` 마이크로 인터랙션은 선택(모션 축소 환경 존중,
  `motion-reduce:transition-none`). 필수는 색+채움 2중 구분이다(색약 대비).

### 3-3. GPS 버튼 3-상태 (`app/page.tsx:947-950`)

| 상태 | 아이콘 | 색 | 버튼 배경 |
|---|---|---|---|
| denied | `LocationOffIcon h-5 w-5` | `text-red-500 dark:text-red-400` | `bg-white/90 dark:bg-gray-800/90 shadow-md backdrop-blur rounded-full` |
| locating | `LoaderIcon h-5 w-5 animate-spin` | `text-gray-600 dark:text-gray-300` | 위와 동일 |
| 기본 | 기존 `icon_gps.png` (변경 없음) | — | 없음(PNG에 배경 포함, 현행 유지) |

- 이모지 시절엔 배경 없이 글리프만 떠서 지도 위 가독성이 나빴다. SVG 상태(denied/locating)에서만
  **전체화면 버튼과 동일한 흰 칩 배경**을 부여한다 — 버튼 크기는 기존 `h-11 w-11`(44px) 그대로라
  레이아웃 불변. 기본 상태는 PNG 그대로(배경 클래스 미적용, 상태별 조건 클래스).
- `aria-label`·`aria-pressed`·`title` 분기 로직 문구 전부 현행 유지(AC-1-4).
- locating 회전은 Tailwind `animate-spin`. `motion-reduce:animate-none` 병기 — 정지 시에도 호(arc)
  모양 자체가 "진행 중"을 전달하고 title 텍스트가 보완한다.

### 3-4. 전체화면 토글 (`app/page.tsx:1001`)

- 진입 가능 상태(비전체화면): `FullscreenIcon`(maximize — 네 모서리 바깥 화살) `h-5 w-5`.
- 전체화면 중: `FullscreenExitIcon`(minimize — 네 모서리 안쪽 화살) `h-5 w-5`.
- 버튼 스타일(흰 칩 44px)·`aria-pressed`·`title` 현행 유지. 두 아이콘은 형태 대비가 커서
  상태 전환이 즉각 인지된다(🗗/⛶ 대비 렌더 안정성 확보가 본 목적).

### 3-5. TOP10 핀 반짝이 ✦ (`KakaoMap.tsx:634-635`, HTML 문자열)

- React 컴포넌트가 아니라 **SVG 마크업 문자열**로 삽입한다. `components/icons/`에 문자열 상수
  (예: `SPARKLE_SVG_STRING`, 12px, `fill="currentColor"`)를 함께 export하거나 KakaoMap 로컬 상수로 둔다(구현 재량).
- 기존 `<span class="top10-sparkle top10-sparkle--a">` 래퍼와 globals.css 애니메이션은 그대로 두고
  span 내용만 ✦ → SVG로 바꾼다. `currentColor`가 span의 CSS color를 상속하므로 색 로직 불변.
- 회귀 시 이 1건만 보류 가능(plan 리스크 3 탈출구).

---

## 4. FR-2 컴포넌트 사양

### 4-1. 공용 BackButton (`components/common/BackButton.tsx` 확장)

```
아이콘 단독 모드 (기본)               라벨 모드 (legal)
┌ ─ ─ ─ ─ ─ ┐ 44px
   ┌─────┐                          ┌──────────────────────────┐
│  │  ←  │  │  아이콘 24px          │ ← 1000냥 주유소 홈으로    │
   └─────┘                          └──────────────────────────┘
└ ─ ─ ─ ─ ─ ┘                       (기존 텍스트 링크 형태 유지,
 rounded-full hover:bg-gray-100       글리프만 BackIcon h-4 인라인)
```

- **props(명세)**: `{ href?: string; label?: string; ariaLabel?: string; className?: string }`
  - `href` 지정 → `<Link href>` 렌더(**Link 모드**). 미지정 → 현행 히스토리 모드
    (`history.length > 1`이면 `router.back()`, 아니면 `/` 폴백).
  - `label` 지정 → 아이콘+텍스트 인라인 링크(legal 전용, 44px 원형 아님 — 세로 히트영역은 `py-3`으로 44px 확보).
  - 파일은 `'use client'` 1개 유지 — 클라이언트 컴포넌트도 서버 컴포넌트 트리 안에서 SSR되므로
    `app/legal/layout.tsx`(서버)에서 Link 모드 사용에 문제없다. (순수 서버 Link 분리는 불필요한 이원화)
- **시각/크기**: `flex h-11 w-11 items-center justify-center rounded-full`(44px),
  `BackIcon h-6 w-6`, `text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800`
  (다크 클래스는 다크 지원 화면에서만 유효 — 미지원 페이지는 라이트 고정이라 무해).
- **aria**: 기본 `aria-label="뒤로 가기"`(아이콘 단독 모드 필수). Link 모드 중 홈 목적지는
  `aria-label="홈으로"` 권장(`ariaLabel` prop으로 오버라이드).
- **헤더 배치**: 기존 헤더가 `h-14`(56px)·`px-3`이므로 44px 버튼이 들어가도 높이 불변.
  36→44px 확대로 제목과의 좌측 간격이 4px 늘어나는 것은 허용(정렬 기준: 아이콘 중심 유지).
- **페이지별 모드·목적지 매핑 (현행 실측 기준 — "목적지 불변" 원칙)**:

| 페이지 | 현행 구현 | 적용 모드 |
|---|---|---|
| `/station/[id]`, `/ev/[statId]` | BackButton(히스토리+폴백 `/`) | 히스토리 모드(불변) |
| `/search` | `router.back()` 자체 구현(폴백 없음) | 히스토리 모드(폴백 `/` 추가 — AC-2-2 허용) + **aria-label 신규** |
| `/my` | `<Link href="/">` | Link 모드 `href="/"` |
| `/my/{favorites,report,vehicles,fuel-logs,interest-regions}` | `<Link href="/my">` | Link 모드 `href="/my"` |
| `/pricing`, `/route` | `<Link href="/">` | Link 모드 `href="/"` (§미해결 1 — plan AC-2-2 문구와 상이, 현행 유지 권고) |
| `/legal/*` | 텍스트 링크 `← …홈으로` | Link 모드 + `label="1000냥 주유소 홈으로"` |

### 4-2. 공용 닫기 버튼 패턴 (CloseIcon + 히트영역 규칙)

```
표준형 (표시줄·팝업 헤더)              배너형 (RadiusAlert 등 우상단 부유)
┌ ─ ─ ─ ─ ─ ┐ 44px                  ┌ ─ ─ ─ ─ ┐ 40px  ← 예외(배너 높이 제약)
   ┌────┐                              ┌────┐        bg-black/20 rounded-full
│  │ ✕ │  │  CloseIcon h-5           │ │ ✕ │ │      CloseIcon h-5, 흰색
   └────┘                              └────┘
└ ─ ─ ─ ─ ─ ┘                        └ ─ ─ ─ ─ ┘
```

- 전용 컴포넌트 신설은 **하지 않는다**(9곳의 배경·색 맥락이 제각각 — 배너 위 반투명, 표시줄 회색 등).
  `CloseIcon` + 아래 클래스 규칙을 명세로 통일하고, 각 자리의 색 클래스는 유지한다.
- **크기 규칙**:
  - 표준: 버튼 `h-11 w-11`(44px) + `CloseIcon h-5 w-5`. 대상: 경로 표시줄(현 `p-1` → 확대,
    표시줄 `py-1.5` 세로 여백 안에서 버튼이 세로로 살짝 겹치는 문제는 `-my-1` 네거티브 마진으로
    시각 높이 불변 처리), FuelDwellPrompt, EvStationPopup.
  - 예외 40px: 알림 배너 3종(RadiusAlert/RouteAlert/PriceTrendBanner) — 현 `h-9 w-9` → `h-10 w-10`,
    absolute 오프셋 `right-1.5 top-1.5` → `right-1 top-1`로 배너 박스 불변. 44px는 3줄 배너 텍스트를
    침범하므로 40px 채택 + 코드 주석으로 사유 명시(plan 허용 규칙).
  - 초소형 예외(40px 미만 — §미해결 2): ReviewForm 사진 삭제(64px 썸네일 위) — 시각 20px 유지,
    버튼 `h-7 w-7`(28px)로 확대 상한. route 최근 목록 칩 삭제 — `h-5` → `h-7 w-7 -my-1`.
    두 곳 모두 "컨테이너가 40px보다 작음" 사유 주석 필수.
- **aria**: 전 닫기 버튼 `aria-label` 필수 — 기존 문구 유지("닫기", "경로 표시 해제", "삭제",
  `"${p.name} 삭제"` 등), 없는 곳은 "닫기" 추가.

### 4-3. FavoriteButton (`components/FavoriteButton.tsx`)

```
비활성                        활성
┌ ─ ─ ─ ─ ─ ┐ 44px          ┌ ─ ─ ─ ─ ─ ┐
   ♡ h-6                       ♥ h-6
   gray-500                    red-500
└ ─ ─ ─ ─ ─ ┘               └ ─ ─ ─ ─ ─ ┘
aria-pressed="false"         aria-pressed="true"
```

- 버튼: `flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-50`
  (+ 다크 지원 화면이면 `dark:hover:bg-gray-800`).
- 아이콘·색: §3-2. `aria-label="즐겨찾기"` 유지 + **`aria-pressed={fav}` 추가**.
- busy 중 `disabled` 처리 현행 유지. 비로그인 → signIn 리다이렉트 흐름 불변.

---

## 5. route "내 위치" 입력 처리안 — **A안 채택: 조건부 좌측 Pin**

```
내 위치 선택 직후                        사용자가 타이핑 시작
┌──────────────────────────┬─────┐     ┌──────────────────────────┬─────┐
│ ◉ 내 위치                │ 검색│     │ 강남역|                  │ 검색│
└─┬────────────────────────┴─────┘     └──────────────────────────┴─────┘
  └ PinIcon h-4 text-primary,            (Pin 사라짐, pl-3 복귀)
    absolute left-3, input pl-9
┌────────────────────────────────┐
│        ◉ 내 위치                │  ← 하단 선택 버튼: 이모지 → PinIcon h-4 인라인
└────────────────────────────────┘
```

- **값 처리**: `value.name === '내 위치'`일 때 입력창 `value`는 플레인 텍스트 `"내 위치"`(이모지 제거, AC-1-5).
- **시각 구분(A안)**: 입력 래퍼 `relative` + `query === '내 위치'`일 때만
  `PinIcon h-4 w-4 text-primary`(장식, `aria-hidden` — 컴포넌트 기본값)를 `absolute left-3 top-1/2 -translate-y-1/2`로
  표시하고 input에 `pl-9` 조건 부여. 사용자가 한 글자라도 수정하면 조건이 깨져 일반 상태(`pl-3`)로 복귀
  — `lastSyncedValue` 동기화 로직은 표시 계층만 바뀌므로 영향 없다.
- 패딩 전환 시 텍스트가 6px 이동하는 것은 "내 위치 → 직접 검색" 모드 전환의 의도적 신호로 허용.
- 구현 중 조건부 패딩이 검색 UX를 해치면 **B안(폴백)**: 좌측 Pin 없이 플레인 텍스트만 + 하단
  "내 위치" 버튼의 PinIcon으로 충분 — 기능 요건(AC-1-5)은 B안으로도 충족된다.

---

## 6. 컴포넌트 매핑

### 재사용 (기존 자산 그대로)

- `components/ui/FilterBar.tsx`의 셰브런/체크 인라인 SVG, `app/page.tsx`의 ⓘ 범례 SVG,
  `components/notice/NoticePopup.tsx`·`components/pwa/InstallBanner.tsx`의 기존 SVG → **규격 원형으로 참조**
  (교체 대상 아님. 단, 동일 모양이 공용 세트에 생기면 점진 치환은 구현 재량).
- `components/map/KakaoMap.tsx`의 왕관 SVG path → `CrownIcon` path 재사용 후보(fill형, 시각 일관).
- `public/icons/icon_gps.png` → GPS 기본 상태 그대로 재사용(범위 외).
- 헤더/시트/배너의 기존 색·타이포·radius(`rounded-xl`, `shadow-sheet`) 전부 불변.

### 수정 (경로 → 변경 내용)

- `components/common/BackButton.tsx` → §4-1 사양(SVG·44px·href/label 모드·aria).
- `components/FavoriteButton.tsx` → §4-3 사양(SVG 하트·44px·색·aria-pressed).
- `components/reviews/StarRating.tsx` → §3-1 사양(SVG 3-상태·크기 표·오버레이 반 별).

### 신규 (제안 경로 → 책임)

- `components/icons/index.tsx` — 공용 아이콘 세트 §1(개별 네임드 컴포넌트, 순수 SVG, 라이선스 고지 주석,
  마커 빌더용 `SPARKLE_SVG_STRING` 문자열 포함). **신규가 필요한 이유**: 코드베이스에 공용 아이콘
  모듈이 없어 재사용 불가(각 파일이 인라인 SVG를 중복 소유 중).

### 그룹별 적용 요약 (파일 → 아이콘 · 크기/색 클래스)

**G1 — 메인 지도·공통 UI·배너**

| 파일 | 교체 내용 |
|---|---|
| `app/page.tsx` | 경로 표시줄: `RouteIcon h-4 text-gray-500 dark:text-gray-400`, "출발→도착"의 → → `ChevronRightIcon h-3 inline-block text-gray-400`; 닫기 → CloseIcon 표준형(§4-2); GPS → §3-3; 전체화면 → §3-4; 토스트 ⛽ → `FuelIcon h-4`(문구 앞 인라인) |
| `components/ui/Header.tsx` | ⚙️ → `SettingsIcon h-4`(관리자 배지, aria-hidden 유지) |
| `components/ui/FilterBar.tsx` | EV 칩 ⚡ → `BoltIcon h-3.5`(`gap-0.5` 유지, 선택 시 흰색 상속) |
| `components/ui/BottomSheet.tsx` | 👑 배지 → `CrownIcon h-3`(currentColor=amber-950, 배지 flex에 `gap-0.5`); "상세 →" → 텍스트+`ChevronRightIcon h-3 inline`; ⚡급속 → `BoltFilledIcon h-3.5` |
| `components/ui/MarkerLegend.tsx` | 👑 → `CrownIcon h-3.5 text-amber-600 dark:text-amber-400`(설명 텍스트 옆 인라인) |
| `components/map/KakaoMap.tsx` | ✦ 2개 → `SPARKLE_SVG_STRING`(§3-5) |
| `components/alert/RadiusAlert.tsx` | ⚠ → `WarningIcon h-3.5`(흰색 상속, 라벨 행 flex+gap-1); ✕ → 배너형 40px(§4-2) |
| `components/alert/RouteAlert.tsx` | 🚗 → `CarIcon h-3.5`; ✕ → 배너형 40px. **푸시 title 이모지(42행) 유지** |
| `components/alert/PriceTrendBanner.tsx` | 📈 → `TrendUpIcon h-3.5`; ✕ → 배너형 40px |

**G2 — 상세·리뷰·EV**

| 파일 | 교체 내용 |
|---|---|
| `app/station/[id]/page.tsx` | 📍📞 라벨 → `PinIcon`/`PhoneIcon h-4 text-gray-400`(행을 `flex items-center gap-1.5`로); ☎ CTA → `PhoneIcon h-4`(버튼 텍스트 앞) |
| `app/station/[id]/not-found.tsx` | ⛽ text-5xl → `FuelIcon h-12 w-12 text-gray-300` |
| `components/FavoriteButton.tsx` | §4-3 |
| `components/station/FuelLogButton.tsx` | ✓/⛽ → `CheckIcon`/`FuelIcon h-4`(CTA 문구 앞) |
| `components/station/MyFuelLogsSection.tsx` | ⚡/⛽ 배지 → `BoltIcon`/`FuelIcon h-3.5` |
| `components/station/FuelDwellPrompt.tsx` | ⛽ → `FuelIcon h-5 text-primary`; ✕ → 표준형 44px |
| `components/reviews/ReviewSection.tsx` | ✍️ → `PencilIcon h-4`(버튼 라벨 앞) |
| `components/reviews/ReviewForm.tsx` | 지오펜스 안내 5종: 📍 → `PinIcon h-3.5`(amber/gray 상속), ✓ → `CheckIcon h-3.5`(green 상속) — 안내 행을 `flex items-start gap-1`로; ✕ 사진 삭제 → 초소형 예외(§4-2); 📷 → `CameraIcon h-4` |
| `components/reviews/StarRating.tsx` | §3-1 |
| `app/ev/[statId]/page.tsx` | ⚡→`BoltIcon`, 🏢→`BuildingIcon`, 📍→`PinIcon`, 📞→`PhoneIcon`, 🕒→`ClockIcon` 각 h-4 text-gray-400 라벨; ☎ CTA → `PhoneIcon h-4` |
| `components/map/EvStationPopup.tsx` | ⚡ 배지 → `BoltIcon h-3.5`; ✕ → 표준형 44px(PC 팝업 — 여유 충분) |
| `components/ev/EvChargeLogButton.tsx` | ✓/⚡ → `CheckIcon`/`BoltIcon h-4` |
| `components/ev/MyEvLogsSection.tsx` | ⚡ → `BoltIcon h-3.5` |

**G3 — 마이페이지 계열**

| 파일 | 교체 내용 |
|---|---|
| `app/my/page.tsx` | ← → BackButton Link 모드(`/`); 메뉴 행: ♡→`HeartIcon`, ⛽⚡→`FuelIcon`+`BoltIcon`, 📊→`ChartIcon`, 🚗→`CarIcon`, 📍→`PinIcon`, 💬→`ChatIcon`, ✉️→`MailIcon` — 전부 `h-4 w-4 text-gray-500` + 라벨 span을 `flex items-center gap-1.5`로(장식, aria-hidden 기본) |
| `app/my/sections.tsx` | "보기/관리 →" → 텍스트 + `ChevronRightIcon h-3.5 inline`(text-primary 상속) |
| `app/my/favorites/page.tsx` | ← → BackButton(`/my`); ♡ 빈 상태 → `HeartIcon h-12 w-12 text-gray-300`; 상세 → → ChevronRight |
| `app/my/{report,vehicles,fuel-logs,interest-regions}/page.tsx` | ← → BackButton(`/my`) |
| `components/profile/AlimtalkToggle.tsx` | 💬→`ChatIcon`, 📱→`SmartphoneIcon` h-4(라벨 앞) |
| `components/push/EnablePushButton.tsx` | 🔔/🔕 → `BellIcon`/`BellOffIcon h-4`(버튼 라벨 앞, 상태 분기 유지) |
| `components/forecast/ForecastNotifyToggle.tsx` | 📈 → `TrendUpIcon h-4` |
| `components/forecast/ForecastCard.tsx` | ⛽ → `FuelIcon h-4`(카드 제목 앞) |
| `components/forecast/ForecastHistory.tsx` | ✅/❌ → `CheckCircleIcon text-green-600`/`XCircleIcon text-red-500` h-4 (+다크 §2) |
| `components/fuel/FuelReport.tsx` | 📊 빈 상태 → `ChartIcon h-12 text-gray-300`; ⚡ 섹션 제목 → `BoltIcon h-4` |
| `components/fuel/FuelLogManager.tsx` | ⛽ 빈 상태 → `FuelIcon h-12 text-gray-300`; 🗺️(text-4xl) → `MapIcon h-9` + 래퍼 `h-10`(§1-4); 📊→`ChartIcon h-4`; ⚡→`BoltIcon h-3.5`; › → `ChevronRightIcon h-4` |
| `components/vehicle/VehicleManager.tsx` | 🚗 → `CarIcon h-5 text-gray-500`(카드 아이콘) |
| `components/interest/InterestRegionManager.tsx` | 📍→`PinIcon h-4`; ✓→`CheckIcon h-3.5`(현재 위치 버튼) |
| `components/pwa/InstallButton.tsx`·`InstallBanner.tsx` | 📲 → `InstallIcon h-4`(라벨 앞) |
| `components/referral/ReferralCard.tsx` | 🎁 → `GiftIcon h-4 inline-block align-[-0.125em]`(문장 내) |

**G4 — 결제·경로·검색·기타**

| 파일 | 교체 내용 |
|---|---|
| `app/pricing/page.tsx` | ← → BackButton(`/`); 💸 → `CoinIcon h-9 text-primary` + 래퍼 `flex h-10 justify-center`(§1-4); ✨ → `SparklesIcon h-4 inline`; ✓/✗ → `CheckIcon text-green-600`/`CloseIcon text-gray-300` h-4 |
| `app/billing/success/page.tsx` | 🎉 → `CelebrationIcon h-12 w-12 text-primary`(가운데 정렬 래퍼 flex justify-center) |
| `app/billing/fail/page.tsx` | 💳 → `CardIcon h-12 w-12 text-gray-400` |
| `app/route/page.tsx` | ← → BackButton(`/`); 최근 칩 ✕ → 초소형 예외(§4-2); 📍 입력/버튼 → §5 |
| `components/route/RouteLoginPrompt.tsx` | 🛣️🔔⛽ → `RouteIcon`/`BellIcon`/`FuelIcon h-5 text-primary`(혜택 행, aria-hidden 유지) |
| `app/search/page.tsx` | ← → BackButton 히스토리 모드 + aria-label 신규 |
| `app/legal/layout.tsx` | ← → BackButton 라벨 모드(§4-1) |
| `app/regions/[region]/page.tsx`·`[district]/page.tsx` | › → `ChevronRightIcon h-3 text-gray-400 inline`(장식) |
| `components/ads/InterstitialAd.tsx` | ⛽(text-4xl) → `FuelIcon h-9 text-gray-300` + 래퍼 `h-10` |

---

## 7. 스타일 지침 (Tailwind · 다크모드 · 모바일)

- **색은 항상 부모 또는 아이콘 자신의 `text-*` 클래스**로. SVG 내부에 색 하드코딩 금지(`currentColor`만).
- **다크모드**: 다크 지원 화면(지도·시트·배너·팝업)은 기존 `dark:` variant를 그대로 상속받으므로
  아이콘에 추가 작업 불필요. 의미색만 §2 표의 `dark:` 쌍을 명시. **다크 미지원 페이지(B-2 이관)는
  `dark:` 클래스를 새로 넣지 않는다** — 페이지가 라이트 고정이라 어긋난 다크 클래스는 버그가 된다.
- **모바일 퍼스트**:
  - 탭 타깃: 아이콘 단독 버튼 44px(`h-11 w-11`) 원칙, 배너 예외 40px, 초소형 예외는 사유 주석(§4-2).
  - 시각 크기와 히트 영역 분리: 버튼 박스는 키우되 아이콘은 §1-4 크기 유지(비대해 보이지 않게).
  - safe-area: 기존 배너·시트가 이미 `env(safe-area-inset-*)` 처리 — 이번 교체로 위치 규칙 변경 없음.
  - 한 손 조작: 지도 오버레이 버튼(GPS/전체화면/범례) 위치·z-index 불변. 오버레이 간섭 없음.
- **모션**: `animate-spin`(로더)·scale 트랜지션에 `motion-reduce:` 무력화 병기. TOP10 반짝임은
  기존 globals.css 모션 중단 규칙에 이미 포함.
- **strokeWidth**: 기본 2. `h-3`~`h-3.5` 초소형만 2.4 허용(가늘어 뭉개지는 것 방지). 혼용 금지.

---

## 8. 상태·엣지 케이스

- **GPS**: denied/locating/기본 3-상태 §3-3. 권한 프롬프트 중(locating)에 사용자가 지도 팬 →
  기존 follow 해제 로직 불변. 오프라인이어도 버튼 상태 렌더는 로컬 분기라 동일.
- **전체화면 미지원(iOS Safari)**: 버튼 자체 미노출(현행 유지) — 아이콘 교체와 무관.
- **즐겨찾기**: busy 중 `disabled + opacity-50`(현행). 비로그인 탭 → 로그인 리다이렉트(하트는 비활성 상태 유지).
  API 실패 시 상태 롤백은 현행 로직 범위(이번 변경 없음).
- **별점 소수 값**: readOnly에서 4.5 → 반 별, 4.3 → `value >= n-0.5` 규칙상 반 별(현행 분기 유지 — 로직 불변).
- **빈 상태/오류 화면**: 빈 상태 일러스트는 저채도 대형 SVG(§2) — 텍스트 대비를 해치지 않는다.
  not-found·billing fail도 동일 규칙. 컨테이너 높이 불변(§1-4)이라 스켈레톤/로딩 시프트 없음.
- **EV 팝업**: PC 전용(모바일은 상세 페이지 라우팅) — 닫기 44px 여유 충분.
- **Mock 모드**: 아이콘은 순수 정적 SVG라 외부 의존 없음 — Mock 렌더에 영향 없음(AC-1-8).
- **오프라인**: 인라인 SVG는 번들에 포함되므로 PNG(icon_gps 등)와 달리 네트워크 실패로 깨질 일이 없다
  (오히려 개선). PWA 캐시 정책 변경 불필요.

---

## 9. 접근성 체크리스트 (구현·QA 공용)

- [ ] 모든 아이콘 컴포넌트 기본 `aria-hidden="true"` — 스크린리더에서 "…이모지" 낭독 0건(AC-1-6).
- [ ] 아이콘 단독 버튼 전수에 한국어 `aria-label`: 뒤로 가기·닫기·즐겨찾기·GPS·전체화면·사진 삭제·
      최근 위치 삭제·길안내. `/search` 뒤로가기는 **신규 추가** 대상.
- [ ] 토글 3종 `aria-pressed`: FavoriteButton(**신규**), GPS follow(기존 유지), 전체화면(기존 유지).
- [ ] 상태를 색으로만 구분하지 않음: 하트(채움+색), 별(채움+색), 예보(아이콘 형태 ○✓/○✕ + 색),
      GPS(형태가 다른 3종 아이콘).
- [ ] 의미색 대비: 단독 노출 금색 crown은 amber-600(라이트) — 그래픽 3:1 충족. 배지 내 crown은
      배지 텍스트 색 상속(amber-950, 고대비).
- [ ] 탭 타깃: 44px 원칙 / 배너 40px / 초소형 예외 주석 — 개발자도구 측정으로 AC-2-3 판정.
- [ ] `motion-reduce` 존중: 로더 회전·하트 scale·TOP10 반짝임.
- [ ] 텍스트 라벨 동반 아이콘(메뉴·배너 라벨·CTA 앞 아이콘)은 전부 장식 취급 — 라벨 텍스트가 의미 전달.

---

## 미해결/리스크

1. **plan AC-2-2 문구와 현행 코드 불일치(중요)**: plan은 "route/pricing/my 서브 = 히스토리 back"으로
   기술했지만, **실측 결과 `/route`·`/pricing`은 `<Link href="/">`, my 서브는 `<Link href="/my">`**다
   (`app/route/page.tsx:172`, `app/pricing/page.tsx:9`, `app/my/*/page.tsx`). 본 명세는 상위 원칙인
   "기존 내비게이션 목적지를 바꾸지 않는다"를 우선해 **Link 모드 유지**로 설계했다(§4-1 표).
   QA 판정 기준을 "현행 목적지와 동일"로 통일하도록 plan 문구 보정 필요.
2. **40px 미달 예외 2곳**: ReviewForm 사진 삭제(64px 썸네일 내)·route 최근 칩 삭제는 컨테이너가
   40px보다 작아 plan의 40px 하한도 못 지킨다. 28px(`h-7`) 상한 + 사유 주석으로 명세했으나,
   plan 예외 규칙의 공식 인정(리뷰어 합의)이 필요하다.
3. **KakaoMap ✦ 문자열 SVG**: HTML 문자열 삽입이라 마커 렌더 회귀 위험(plan 리스크 3과 동일).
   `SPARKLE_SVG_STRING` 방식으로 색 상속을 보존하도록 설계했으나 QA에서 반짝임 애니메이션 확인 필수.
   회귀 시 이 1건 보류 탈출구 유지.
4. **pricing 히어로·결제 일러스트의 감성 저하 가능성**: 💸→Coins(주황)·🎉→PartyPopper·💳→CreditCard는
   단색이라 이모지의 색·유쾌함 대비 밋밋할 수 있다. 기능 요건(문자 제거+높이 불변)은 충족하되,
   추후 "브랜드 일러스트 사이클"에서 2-톤 SVG(primary+amber)로 업그레이드할 여지를 남긴다.
5. **별점 입력 44px 미충족**: 별 5개 가로 나열 특성상 개별 별 44px은 폼 폭을 초과한다.
   `p-1` 패딩(실탭 32px+)과 별 간 간격으로 보완 — FR-2의 44px 원칙 대상(뒤로/닫기/즐겨찾기)엔
   포함되지 않으나 QA가 오해하지 않도록 명시해 둔다.
6. **경로 표시줄 "출발 → 도착" 화살표**: AC-1-1 grep이 `→`를 잡으므로 ChevronRight 인라인으로
   교체 명세했으나, `truncate` 텍스트 안 SVG는 말줄임 계산에 미묘한 차이를 만들 수 있다.
   구현 시 한 줄 말줄임이 유지되는지 확인 필요(대안: flex 분할로 이름·화살표·이름을 각각 truncate).
7. **Lucide 라이선스 표기**: plan은 "Lucide/Heroicons — MIT"로 썼으나 Lucide는 **ISC**다(허용 범위 동등).
   고지 주석에 정확한 라이선스명을 기재하면 문제 없음 — 구현 시 문구만 주의.
8. **다크 미지원 페이지의 아이콘 다크 클래스**: §7 지침대로 넣지 않는 것이 맞지만, 추후 B-2(다크모드
   사이클)에서 해당 페이지에 `dark:`를 깔 때 이번에 넣은 라이트 전용 아이콘 색도 함께 보정해야 한다
   — B-2 사이클 체크리스트에 "G2~G4 아이콘 다크 색 추가" 항목 이관 필요.
