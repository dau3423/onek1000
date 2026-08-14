# 조사 보고: 화면 UX 다듬기 + 이모지 아이콘 → SVG 아이콘 교체

- 작성일: 2026-08-14 (자료조사 담당)
- 모드: 주제 지정
- 조사 근거: 코드 전수 grep(`rg -P` 유니코드 이모지 범위, `app/ components/ lib/ hooks/ stores/`),
  `docs/요구사항_명세서.md`, `docs/04_화면설계.md`, `git log --oneline -30`, `package.json`

---

## A. 이모지/문자 아이콘 전수 인벤토리

### A-0. 조사 방법

- `rg -nP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}...]'` 로 이모지 범위 전수 검색 후,
  ←/→/✕/★/♡/ⓘ/⛶ 등 "문자를 아이콘처럼 쓰는" 심볼을 개별 검색으로 보강.
- 주석(설명용 이모지: `stores/map.ts`, `KakaoMap.tsx:18` 등 다수)은 인벤토리에서 제외.
- 서버가 생성하는 **비-UI 텍스트**(푸시 제목, SNS 카피, 관리자 카톡 메모, OG 이미지)는 별도 분류(A-4)로 두고 교체 대상에서 제외 권고.

### A-1. 사용자 화면에 실제 렌더되는 이모지 (교체 대상)

#### 메인 지도 (`app/page.tsx`)

| 위치 | 문자 | UI 맥락 | 노출 |
|---|---|---|---|
| `app/page.tsx:847` | 🛣️ | 경로 모드 표시줄 좌측 아이콘 | 실사용(경로 모드 시) |
| `app/page.tsx:862` | ✕ | 경로 표시줄 닫기 버튼 글리프 | 실사용 |
| `app/page.tsx:948` | 🚫 | GPS 버튼 — 위치 권한 거부 상태 글리프 | 실사용(상태별) |
| `app/page.tsx:950` | ⏳ | GPS 버튼 — 위치 확인 중 상태 글리프 | 실사용(상태별) |
| `app/page.tsx:1001` | 🗗 / ⛶ | 전체화면 토글 버튼 글리프 | 실사용(지원 브라우저) |
| `app/page.tsx:1173` | ⛽ | "주유 기록 저장" 토스트 | 실사용 |

#### 헤더/필터/하단 시트/범례

| 위치 | 문자 | UI 맥락 | 노출 |
|---|---|---|---|
| `components/ui/Header.tsx:42` | ⚙️ | 관리자 콘솔 배지 링크 (aria-hidden) | 관리자에게만 |
| `components/ui/FilterBar.tsx:148` | ⚡ | EV 칩 아이콘 (aria-hidden) | 실사용 |
| `components/ui/BottomSheet.tsx:217` | 👑 | "전국 N위" 황금 배지 | 실사용 |
| `components/ui/BottomSheet.tsx:235` | → | 목록 행 "상세 →" 링크 | 실사용 |
| `components/ui/BottomSheet.tsx:294` | ⚡ | EV 목록 "⚡급속" 배지 | 실사용(EV) |
| `components/ui/MarkerLegend.tsx:325` | 👑 | 범례 설명 텍스트 "👑 + 순위 숫자" | 실사용 |
| `components/map/KakaoMap.tsx:634-635` | ✦ | TOP10 핀 반짝임 장식(span, CSS 애니메이션) | 실사용(장식) |

#### 알림 배너

| 위치 | 문자 | UI 맥락 | 노출 |
|---|---|---|---|
| `components/alert/RadiusAlert.tsx:53` | ⚠ | "1km 안에 더 싼 곳!" 배너 라벨 | 실사용 |
| `components/alert/RadiusAlert.tsx:49` | ✕ | 배너 닫기 버튼 | 실사용 |
| `components/alert/RouteAlert.tsx:67` | 🚗 | "경로상 최저가 N m 앞" 배너 라벨 | 실사용 |
| `components/alert/RouteAlert.tsx:64` | ✕ | 배너 닫기 버튼 | 실사용 |
| `components/alert/PriceTrendBanner.tsx:104` | 📈 | "기름값 오름세" 배너 라벨 | 실사용 |
| `components/alert/PriceTrendBanner.tsx:110` | ✕ | 배너 닫기 버튼 | 실사용 |

#### 주유소 상세 (`app/station/[id]/`)

| 위치 | 문자 | UI 맥락 | 노출 |
|---|---|---|---|
| `app/station/[id]/page.tsx:65` | 📍 | 주소 라벨 | 실사용 |
| `app/station/[id]/page.tsx:66` | 📞 | 전화번호 라벨 | 실사용 |
| `app/station/[id]/page.tsx:129` | ☎ | "전화걸기" CTA | 실사용 |
| `app/station/[id]/not-found.tsx:6` | ⛽ | 404 일러스트(text-5xl) | 실사용 |
| `components/FavoriteButton.tsx:56` | ♥ / ♡ | 헤더 즐겨찾기 토글 글리프(색상 클래스 없음) | 실사용 |
| `components/station/FuelLogButton.tsx:179-181` | ✓ / ⛽ | "여기서 주유" CTA / 저장 완료 상태 | 실사용 |
| `components/station/MyFuelLogsSection.tsx:48,52` | ⚡ / ⛽ | 내 기록 행 유형 배지 | 실사용 |
| `components/station/FuelDwellPrompt.tsx:132,139` | ⛽ / ✕ | "방금 주유하셨나요?" 팝업 본문/닫기 | 실사용 |
| `components/reviews/ReviewSection.tsx:39` | ✍️ | "리뷰 쓰기" 버튼 | 실사용 |
| `components/reviews/ReviewForm.tsx:213-239` | 📍 / ✓ | 지오펜스 상태 안내 5종 | 실사용 |
| `components/reviews/ReviewForm.tsx:202,250` | ✕ / 📷 | 사진 삭제 / "사진 추가" 버튼 | 실사용 |
| `components/reviews/StarRating.tsx:24` | ★ / ☆ | 별점 입력·표시(문자 글리프+색상) | 실사용 |

#### EV 충전소 (`app/ev/`, `components/ev|map`)

| 위치 | 문자 | UI 맥락 | 노출 |
|---|---|---|---|
| `app/ev/[statId]/page.tsx:39,41-44,81` | ⚡🏢📍📞🕒☎ | 상세 헤더 배지·주소·전화·운영시간 라벨·전화 CTA | 실사용 |
| `components/map/EvStationPopup.tsx:51,65` | ⚡ / ✕ | PC 팝업 배지/닫기 | 실사용(PC) |
| `components/ev/EvChargeLogButton.tsx:135` | ✓ / ⚡ | "여기서 충전" CTA/완료 상태 | 실사용 |
| `components/ev/MyEvLogsSection.tsx:47` | ⚡ | 충전 기록 배지 | 실사용 |

#### 마이페이지 계열 (`app/my/`, `components/{profile,fuel,vehicle,interest,push,pwa,referral,forecast}`)

| 위치 | 문자 | UI 맥락 | 노출 |
|---|---|---|---|
| `app/my/page.tsx:95,109,120,128,142,184,191` | ♡ ⛽⚡ 📊 🚗 📍 💬 ✉️ | 메뉴 행 아이콘 7종 | 실사용 |
| `app/my/page.tsx:49` + `sections.tsx:121,185,194,203` | ← / → | 뒤로가기 / "보기·관리 →" | 실사용 |
| `app/my/favorites/page.tsx:36,43,68` | ← ♡ → | 뒤로가기/빈 상태 일러스트/상세 링크 | 실사용 |
| `app/my/{report,vehicles,fuel-logs,interest-regions}/page.tsx` (각 15~21행) | ← | 뒤로가기 버튼 | 실사용 |
| `components/profile/AlimtalkToggle.tsx:93,127` | 💬 📱 | 알림톡/휴대폰 번호 설정 라벨 | 실사용 |
| `components/push/EnablePushButton.tsx:78` | 🔔 / 🔕 | 푸시 토글 버튼 | 실사용 |
| `components/forecast/ForecastNotifyToggle.tsx:46` | 📈 | 예측 알림 토글 라벨 | 실사용 |
| `components/forecast/ForecastCard.tsx:171,213` | ⛽ | 주유 타이밍 전망 카드 제목 | 실사용 |
| `components/forecast/ForecastHistory.tsx:39` | ✅ / ❌ | "적중/빗나감" 배지 | 실사용 |
| `components/fuel/FuelReport.tsx:57,140` | 📊 ⚡ | 리포트 빈 상태/EV 섹션 제목 | 실사용 |
| `components/fuel/FuelLogManager.tsx:108,190,245,275,279,286` | ⛽ 🗺️ 📊 ⚡ › | 빈 상태 2종/리포트 링크/행 배지/셰브런 | 실사용 |
| `components/vehicle/VehicleManager.tsx:94` | 🚗 | 차량 카드 아이콘 | 실사용 |
| `components/interest/InterestRegionManager.tsx:108,145` | 📍 ✓ | 지역 행 아이콘/"현재 위치" 버튼 | 실사용 |
| `components/pwa/InstallButton.tsx:37` / `InstallBanner.tsx:58` | 📲 | "홈 화면에 앱 설치" | 실사용 |
| `components/referral/ReferralCard.tsx:77` | 🎁 | 친구 추천 카드 문구 | 실사용(문장 내) |

#### 결제·경로·검색·기타

| 위치 | 문자 | UI 맥락 | 노출 |
|---|---|---|---|
| `app/pricing/page.tsx:10,16,32,98,101` | ← 💸 ✨ ✓ — | 뒤로가기/히어로/표 헤더/체크 | 실사용 |
| `app/billing/success/page.tsx:21` | 🎉 | 결제 성공 일러스트(text-5xl) | 실사용 |
| `app/billing/fail/page.tsx:27` | 💳 | 결제 실패 일러스트(text-5xl) | 실사용 |
| `app/route/page.tsx:173,243,308,424` | ← ✕ 📍 | 뒤로가기/최근 목록 삭제/"📍 내 위치" 입력값·버튼 | 실사용 |
| `components/route/RouteLoginPrompt.tsx:124-136` | 🛣️ 🔔 ⛽ | 로그인 유도 팝업 혜택 3종 (aria-hidden) | 실사용(비회원) |
| `app/search/page.tsx:42` | ← | 뒤로가기 | 실사용 |
| `components/common/BackButton.tsx:31` | ← | 공용 뒤로가기 컴포넌트 | 실사용 |
| `app/legal/layout.tsx:8` | ← | "홈으로" 링크 | 실사용 |
| `app/regions/[region]/page.tsx:95`, `[district]/page.tsx:96,98` | › | 브레드크럼 구분자 | 실사용(SEO 페이지) |
| `components/ads/InterstitialAd.tsx:51` | ⛽ | 전면 광고 폴백 CTA 일러스트 | 실사용(무료+광고미설정) |

### A-2. 조건부/비활성 노출 (우선순위 낮음)

| 위치 | 문자 | 비고 |
|---|---|---|
| `components/promo/WelcomePromo.tsx:20-27` | 🚫⛽🗺️🔔🎁 | **현재 미노출** — `app/page.tsx:24` 주석으로 노출 중단됨. 되살릴 때 함께 교체 |
| `app/admin/page.tsx:218`, `app/admin/notice/NoticeAdminClient.tsx:113`, `app/admin/daily-top10/DailyTop10Client.tsx:153,167,175,210,211` | → 📢 ⛽ ✓ 🟢 ⚫ | 관리자 전용 화면 — 사용자 미노출, 후순위 |

### A-3. 기능적 의미를 갖는 글리프 (교체 시 주의)

- **★/☆ 별점**(`StarRating.tsx:24`): 문자 색상(`text-primary`)으로 채움을 표현. SVG 교체 시 반개(half) 표현 로직(현재 `text-primary/60`)을 SVG fill로 재현해야 함.
- **♥/♡ 즐겨찾기**(`FavoriteButton.tsx:56`): 토글 상태가 글리프 자체로 표현됨. 색상 클래스가 없어 채운 하트도 검정으로 보임 → SVG 교체 시 상태 색(fill) 개선 기회. `aria-pressed` 미지정(접근성 보강 겸).
- **🚫/⏳ GPS 상태**(`app/page.tsx:948-950`): 버튼의 3-상태(거부/확인중/아이콘) 분기 중 2개가 이모지. 상태 의미 유지 필수.
- **🗗/⛶ 전체화면**(`app/page.tsx:1001`): OS/폰트에 따라 미지원 글리프(두부 문자)로 깨질 위험이 가장 큰 문자. 우선 교체 권장.
- **✕ 닫기**(9곳): 크기·굵기가 폰트 의존적. 공용 CloseIcon 1개로 통일 가치 큼.

### A-4. 교체 대상 아님 (비-UI 텍스트 — 유지 권고)

- Web Push 제목: `app/api/internal/sync-opinet/route.ts:557,656`, `weekly-digest/route.ts:110`, `lib/forecast/notify.ts:108`, `components/alert/RouteAlert.tsx:42`(푸시 title) — 푸시 알림은 이모지가 가독성에 유리, OS가 렌더.
- SNS/블로그 콘텐츠 생성기: `lib/content/dailyTop10.ts`(🥇🥈🥉 등), `lib/daily-top10.ts` — 대외 카피 텍스트.
- 관리자 카톡 메모: `lib/billing/confirm.ts:184`, `lib/kakao/adminMemo.ts`.
- OG 이미지: `app/opengraph-image.tsx:89`, `app/api/og/daily-top10/route.tsx` — Satori 렌더 이미지.
- `app/route/page.tsx:308` "📍 내 위치"는 **입력창 value 문자열**이라 SVG 삽입 불가 — 텍스트만 남기거나 입력창 좌측 아이콘으로 분리하는 별도 처리 필요.

### A-5. 교체 방식 근거 (현재 코드베이스의 아이콘 패턴)

- **아이콘 라이브러리 없음**: `package.json` dependencies에 lucide-react/react-icons/heroicons 등 없음. SRS §9·§10(DoD 6번)은 "불필요한 의존성 추가 없음"을 요구.
- **기존 패턴 3종이 이미 존재**:
  1. **인라인 SVG (stroke=currentColor, viewBox 24)** — `components/ui/FilterBar.tsx:78,108`(셰브런/체크), `app/page.tsx:978`(ⓘ 범례 버튼), `components/notice/NoticePopup.tsx:104`, `components/pwa/InstallBanner.tsx:77`, `components/ui/MarkerLegend.tsx:223` 등. **이 패턴이 사실상 표준.**
  2. PNG 에셋 — `public/icons/`(icon_search, icon_run, icon_gps, icon_profile 등, `components/ui/Header.tsx`).
  3. HTML 문자열 SVG — 지도 마커(`components/map/KakaoMap.tsx:145`(왕관), `lib/map/markerFace.ts`, `lib/map/evMarker.ts`). 마커 얼굴/왕관/EV 번개는 **이미 SVG라 이번 범위 아님**.
- **결론(권고)**: 새 의존성 없이 `components/icons/index.tsx`(가칭)에 **공용 인라인 SVG 아이콘 컴포넌트 세트**(예: `Icon name="close" | "pin" | "phone" | "bolt" | "back" | ...`, `currentColor` 기반, `aria-hidden` 기본)를 만들어 교체하는 것이 기존 코드 톤과 가장 자연스럽다. 라이선스 걱정 없는 오픈소스 path(예: Lucide/Heroicons MIT path 복사)를 인라인으로 가져오면 됨.

---

## B. 화면 UX 불편 지점

### B-1. 아이콘 글리프의 OS 의존 렌더 + 작은 탭 타깃 (이번 주제 ①과 직결)

- **위치**: `app/my/page.tsx:48-50`, `app/search/page.tsx:38-43`, `components/FavoriteButton.tsx:54`, `app/route/page.tsx:173`, `app/pricing/page.tsx:10` 등.
- **불편**: ←/♥/✕가 기기 폰트에 따라 굵기·정렬이 제각각이고, 뒤로가기·즐겨찾기 버튼이 `h-9 w-9`(36px)로 모바일 권장 탭 타깃(44px, 코드 내 다른 버튼들은 `h-11`~`h-12` 사용: `Header.tsx:49`, `app/page.tsx:935`)보다 작다.
- **개선 가설**: 아이콘 교체 작업에서 공용 `BackButton`(이미 `components/common/BackButton.tsx` 존재)을 SVG+44px로 정리하고 각 페이지가 자체 구현한 뒤로가기(`my`, `search`, `pricing`, `route`, 각 `my/*` 서브페이지)를 공용 컴포넌트로 수렴.
- **비용**: 소 (아이콘 교체와 동일 파일들).

### B-2. 다크모드 미적용 페이지 혼재 (NFR-8 위반)

- **위치**: `tailwind.config.ts`에 `darkMode` 키 없음 → 기본 `media`(OS 설정 자동 적용). 지도 계열(`FilterBar`, `BottomSheet`, `StationPopup`, `MarkerLegend`)은 `dark:` variant가 있으나, **`app/my/page.tsx`(bg-white 고정), `app/search/page.tsx`, `app/station/[id]/page.tsx`, `app/pricing/page.tsx`는 `dark:` variant가 전무**.
- **불편**: 다크모드 사용자 기준 지도의 시트/팝업은 어두운데 상세·마이·검색으로 넘어가면 흰 화면이 번쩍임. SRS NFR-8("토큰 기반 라이트/다크 지원")과 불일치.
- **개선 가설**: 페이지 단위로 `dark:` variant 추가(우선순위: 상세 > 검색 > 마이).
- **비용**: 중 (파일 수는 많지만 기계적 작업. 한 사이클에 1~2개 페이지씩 분할 가능).

### B-3. 검색 결과 가격이 항상 휘발유 고정

- **위치**: `app/api/search/route.ts:36,46` — `prices_latest.product = 'B027'` 하드코딩. Mock 경로도 `getMockStations('B027')`(17행).
- **불편**: 경유/LPG 차량 사용자가 검색해도 휘발유 가격이 떠서 비교가 안 됨. 서비스는 이미 차량 유종(`/my/vehicles`)·유종 필터(`stores/map.ts`)를 갖고 있어 괴리가 더 두드러짐.
- **개선 가설**: 검색 API에 `product` 쿼리 파라미터 추가 + 검색 페이지가 현재 선택 유종(zustand)을 전달, 결과 행에 유종 라벨 표기.
- **비용**: 중 (API+화면 각 소폭).

### B-4. 상세 페이지 30일 차트가 휘발유(B027) 고정

- **위치**: `app/station/[id]/page.tsx:99-100`(`product="B027"` 하드코딩, 제목도 "휘발유 30일 추이"), `FuelLogButton` 단가도 `detail.prices.B027`만 사용(122행).
- **불편**: 경유·LPG 사용자는 자기 유종 추이를 볼 수 없고, LPG 전용 충전소는 차트가 비어 보인다.
- **개선 가설**: 차트 상단에 유종 탭(가격이 존재하는 유종만) 추가. `PriceHistoryChart`가 이미 `product` prop을 받으므로 클라이언트 래퍼만 추가하면 됨.
- **비용**: 중.

### B-5. 문서상 필터(셀프/등유)와 구현 괴리

- **위치**: SRS FR-1.3·`docs/04_화면설계.md` §2는 "유종(휘발유/고급/경유/LPG/**등유**) + 브랜드 + **셀프**" 필터를 명시. 실제 `components/ui/FilterBar.tsx`는 휘발유(일반/고급 드롭다운)·경유·LPG·EV 칩 + 브랜드(회원 전용)만 있고 **셀프 필터·등유 칩 없음**(`rg '셀프|K015' FilterBar.tsx stores/map.ts` 무일치).
- **불편**: 셀프만 찾는 사용자(가격 민감층 핵심 니즈)가 지도를 일일이 눌러 확인해야 함. 등유는 니치이므로 후순위.
- **개선 가설**: `is_self`는 이미 API 응답에 포함(`app/api/search/route.ts:34`, BottomSheet에 "· 셀프" 표기 존재)되므로 클라이언트 필터 토글 칩 1개로 구현 가능.
- **비용**: 소~중.

### B-6. 1km 알람 임계값 설정 불가 (FR-2.3 미완)

- **위치**: `app/page.tsx:45` `const ALERT_THRESHOLD = 50;` 하드코딩. SRS FR-2.3은 "임계값은 설정에서 조정 가능", `docs/04` §5 마이페이지 와이어프레임에도 설정(기본 유종/임계값/반경) 섹션이 있으나 `app/my/page.tsx`에 설정 섹션 자체가 없음.
- **불편**: 알람이 잦다고 느끼는 사용자가 끄는 것 외의 선택지가 없음.
- **개선 가설**: 마이페이지에 간단 설정(임계값 30/50/100원, localStorage) 추가.
- **비용**: 중. (후순위 — 니즈 규모 불확실, 가설)

### B-7. 즐겨찾기 버튼 상태 접근성/시인성

- **위치**: `components/FavoriteButton.tsx:50-57` — `aria-label="즐겨찾기"` 고정, `aria-pressed` 없음, ♥에 색상 클래스 없음(채워도 검정).
- **불편**: 저장 여부가 시각적으로 약하고 스크린리더로는 구분 불가(NFR-7 WCAG 방향과 어긋남).
- **개선 가설**: SVG 하트 + `aria-pressed` + 활성 시 `text-primary`(또는 red) — 아이콘 교체 작업에 포함하면 비용 0에 가까움.
- **비용**: 소.

---

## 이번 사이클 범위 권고

한 사이클(반나절, FR 3개 이내) 기준:

1. **[필수] FR-A. 공용 SVG 아이콘 세트 도입 + 사용자 노출 이모지/글리프 교체**
   - `components/icons/` 신설(의존성 추가 없음, 기존 인라인 SVG 패턴 준수: `stroke/fill=currentColor`, `aria-hidden`).
   - 교체 범위(A-1 표): 메인 지도(🛣️🚫⏳🗗⛶✕⛽토스트) → 알림 배너 3종(⚠🚗📈✕) → 상세/EV 상세 라벨(📍📞☎🕒⚡🏢) → 마이페이지 메뉴 7종 + ←/→/›/✕ 공용화 → 나머지(리뷰/기록/설치/결제 일러스트).
   - 별점(★/☆)·하트(♥/♡)는 상태 로직 보존에 유의(A-3). `route/page.tsx:308`의 입력값 "📍 내 위치"는 문자열이므로 텍스트 처리 별도 결정 필요.
   - A-2(비활성 WelcomePromo·관리자 화면)와 A-4(푸시/SNS/OG)는 **제외**.
2. **[권장] FR-B. 뒤로가기/닫기 버튼 공용화 + 탭 타깃 44px 정규화** (B-1, B-7) — FR-A와 같은 파일을 만지므로 함께 하면 증분 비용이 가장 작음.
3. **[선택] FR-C. 상세 페이지 가격 추이 유종 탭** (B-4) — 사용자 편익 대비 범위가 작고 독립적. 사이클 여유 시 포함.

**후순위(백로그 성격)**: B-2 다크모드 정합(규모 큼 — 별도 사이클로 페이지 단위 분할), B-3 검색 유종 반영, B-5 셀프 필터, B-6 알람 임계값 설정.

---

## 미해결/리스크

- **접근성**: 현재 일부 이모지는 `aria-hidden`이 붙어 있으나(예: `FilterBar.tsx:148`, `RouteLoginPrompt.tsx:124`) 대부분은 텍스트 노드로 스크린리더에 "주유펌프 이모지"처럼 읽힌다. SVG 교체 시 **장식 아이콘은 `aria-hidden` 필수**, 의미 전달 아이콘(GPS 거부 🚫 등)은 대체 텍스트(aria-label)가 유지되는지 확인 필요.
- **기능적 글리프**: ★/☆(반개 별점), ♥/♡(토글), 🚫/⏳(GPS 3-상태), 🗗/⛶(전체화면 토글)은 단순 치환이 아니라 상태 분기 로직과 함께 교체해야 한다(A-3).
- **지도 마커 계열은 이미 SVG**(왕관 `KakaoMap.tsx:157`, 얼굴 `lib/map/markerFace.ts`, EV 번개 `lib/map/evMarker.ts`) — 중복 작업하지 않도록 주의. 단 TOP10 핀의 ✦ 장식(`KakaoMap.tsx:634-635`)은 HTML 문자열 안의 문자라 교체 시 마커 빌더 문자열 수정이 필요.
- **다크모드 색상**: `currentColor` 기반 SVG는 대부분 자동 대응되지만, 이모지가 갖던 "고유 색"(🟢 초록 원, 👑 금색)이 의미를 담은 곳(BottomSheet 👑 배지, 범례)은 색을 명시해야 한다.
- **레이아웃 시프트**: 이모지는 폰트 크기에 종속(`text-5xl` 일러스트 등)이라 SVG 교체 시 크기(px)를 맞추지 않으면 빈 상태 일러스트·토스트 높이가 달라질 수 있음 — 시각 확인(QA) 필요.
- **검증 한계**: 본 조사는 정적 코드 기준. 실제 기기(iOS/Android)별 글리프 깨짐(특히 🗗, ⛶, ✦)은 실기기 확인을 못 했으므로 "깨질 위험이 크다"는 가설임.
- **B-6(임계값 설정) 니즈 크기 미검증**: 사용자 데이터 없이 SRS 문구 기준의 괴리 지적 — 우선순위 판단은 PM 몫.
