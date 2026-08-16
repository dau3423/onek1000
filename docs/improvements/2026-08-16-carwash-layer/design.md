# 디자인 명세: 독립 세차장 지도 레이어

> 담당: UI/UX. 코드 수정 없음(명세만). 2026-08-16 작성.
> 입력: `docs/improvements/2026-08-16-carwash-layer/plan.md`(FR/AC), `docs/improvements/2026-08-16-carwash-places-research/research.md`(필드·유형 분포).
> 재사용 전례 코드: `components/ui/FilterBar.tsx`, `components/map/EvStationPopup.tsx`, `components/ui/MarkerLegend.tsx`, `components/map/KakaoMap.tsx`, `lib/map/evMarker.ts`, `stores/map.ts`, `components/ui/BottomSheet.tsx`, `components/icons/index.tsx`, `components/carwash/CarwashDayCard.tsx`(면책/출처 카피 톤).
> 기존 룩앤필: 칩 = `rounded-full px-3 py-1.5 text-xs font-semibold`, 활성 = `bg-primary text-white`, 비활성 = `bg-gray-100 ... dark:bg-gray-800`. 팝업 = `rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-900`. 브랜드 primary = `#FF6B00`.

---

## 0. 핵심 결론 먼저 — '세차'(부설 필터) vs '세차장'(독립 레이어) 구분 최종안

혼동의 원인은 두 기능이 **성격이 다른데 라벨·아이콘·위치가 비슷하다**는 점이다. 아래로 세 축(성격/라벨/아이콘/위치)을 전부 갈라놓는다.

| 축 | 기존 '세차' 칩 (C2 커밋) | 신규 '세차장' 레이어 (이번 사이클) |
|---|---|---|
| **성격** | gas 레이어 안의 **필터 토글**(has_carwash 주유소만 남김). 레이어를 바꾸지 않음. | **레이어 전환**(EV처럼 gas↔ev↔carwash 상호배타). 주유소 대신 독립 세차장을 보여줌. |
| **최종 라벨** | **"세차 가능"** (기존 "세차"에서 개명) | **"세차장"** |
| **아이콘** | `DropletIcon`(물방울) — 그대로 유지 | 신규 `CarwashIcon`(차체+분사, 아래 §컴포넌트 매핑) — 물방울과 형태가 다름 |
| **동작 표식** | `aria-pressed`(토글 on/off), primary 채움은 "필터 켜짐"을 의미 | `aria-pressed`(레이어 선택), primary 채움은 "이 레이어를 보는 중"을 의미 |
| **위치/그룹** | gas 레이어 전용 **필터 그룹**(경유·LPG 옆). carwash·ev 레이어에서는 **숨김** | **레이어 그룹**(EV 칩 바로 옆). 항상 노출 |
| **노출 조건** | `layer==='gas'`일 때만 | 항상(gas/ev/carwash 어디서든 진입 가능) |

**최종 제안(요약)**
1. **기존 칩 개명**: "세차" → **"세차 가능"**. "이 주유소에서 세차가 되나"라는 필터임을 라벨만으로 전달. (plan §FR-2 제안 채택. "주유+세차"는 칩 폭이 커져 스크롤 부담 → 더 짧은 "세차 가능" 선택.)
2. **신규 레이어 칩**: **"세차장"**. "장소(독립 세차장)"임을 장(場) 글자로 구분. EV 칩과 같은 레이어 그룹·같은 강조 스타일.
3. **아이콘 분리**: 부설=물방울(`DropletIcon`), 레이어=차체+분사(`CarwashIcon` 신규). 색으로도 마커 단계에서 완전히 다름(부설 필터는 기존 주유소 마커 그대로, 세차장 레이어는 유형별 색 핀).
4. **시각적 그룹 경계**: FilterBar에서 유종/필터 칩과 레이어 칩(EV·세차장) 사이에 얇은 세로 구분선(`h-4 w-px bg-gray-200 dark:bg-gray-700`)을 넣어 "여기부터는 레이어 전환"임을 무언으로 암시.
5. **첫 진입 1줄 안내**: '세차장' 칩을 처음 탭할 때(세션 1회) 지도 상단에 토스트 — "독립 셀프·손세차장을 보여드려요. 주유소로 돌아가려면 유종 칩을 탭하세요." (혼동 결정타 방지, 선택적이지만 권장.)

---

## 1. 화면 흐름 (진입 → 행동 → 결과)

### 흐름 A — 주유소 보다가 세차장 레이어로 전환 (US-1, FR-2)
1. 사용자는 홈 `/`에서 주유소 지도(gas)를 보는 중. FilterBar에 `[휘발유▼] [경유] [LPG] │ [EV] [세차장]` + 우측 `[전체브랜드▼]`, 그리고 gas 전용 `[세차 가능]` 필터 칩.
2. **'세차장' 칩 탭** → `setLayer('carwash')`. 지도의 주유소 가격 마커·TOP10·회색 점이 사라지고(기존 `layer==='ev'` 분기와 동형), 세차장 유형별 색 핀이 그려짐. 칩은 `aria-pressed=true`로 primary 채움.
3. 동시에 FilterBar가 **carwash 모드로 재구성**: `[세차 가능]`(부설 필터)·브랜드 필터·유종 칩은 숨고, 대신 **유형 세그먼트 필터** `[전체][셀프][손세차][자동]`가 그 자리에 노출(FR-3, AC-3.1).
4. 지도를 움직이면 `onBoundsChange` → `/api/carwash/bbox` 재조회 → 화면 내 세차장 마커 갱신(EV의 `fetchEvStations` 패턴).
5. **마커 탭** → `CarwashPopup` 오픈(모바일=하단 시트형 모달, 데스크톱=중앙 카드). 이름·유형 뱃지·주소·(있으면)전화/운영시각/요금·길안내 CTA·출처/노후 고지.

### 흐름 B — 유형으로 걸러 보기 (US-2, FR-3)
1. carwash 레이어에서 세그먼트 `[셀프]` 탭 → `setCarwashType('self')`.
2. 지도 마커가 `wash_type==='self'`만 남고 hand/auto/unknown 핀은 사라짐(클라이언트 필터 기본안, AC-3.2). 세그먼트는 선택 항목만 primary.
3. `[전체]`로 되돌리면 unknown 포함 전부 복원(AC-3.3). 기본 진입값은 항상 `전체`.

### 흐름 C — 정보 신뢰성 확인 (US-3, FR-2 AC-2.5/2.6/2.8)
1. 유형 미확인 세차장 마커(회색 핀) 탭 → 팝업 유형 뱃지가 **"유형 미확인"**으로 정직 표기(AC-2.5, 임의 채움 금지).
2. 팝업 하단에 고정 고지: "공공데이터 기준이라 실제와 다를 수 있어요(폐업·정보 변경 가능) · 출처: 행정안전부 전국세차장표준데이터"(AC-2.6·2.8).

### 흐름 D — 데이터 없음/미적재/Mock (FR-1 AC-1.1/1.2, FR-2 AC-2.7)
- carwash 레이어 진입 후 응답이 빈 배열(미적재·bbox 내 없음·mock 빈 값)이면 지도 크래시 없이 **빈 상태 오버레이 배너** "이 지역에 표시할 세차장이 없어요. 지도를 옮기거나 축소해 보세요." 노출. 콘솔 에러/무한 로딩 없음.

### FR 커버리지 매핑
- **FR-1**(파이프라인, 백엔드): UI 반영 지점 = 흐름 D(빈/mock 안전), 팝업 필드 원천(유형·주소·전화·운영·요금·기준일). 개인정보(대표자명) 제외는 팝업에 해당 필드 자체가 없음으로 반영.
- **FR-2**(레이어 UI): 흐름 A·C 전체 + §2 와이어프레임(칩/마커/팝업/범례).
- **FR-3**(유형 필터): 흐름 B + §2-3 세그먼트.
- 모든 AC는 §5 상태·엣지 표에서 화면 상태로 재확인.

---

## 2. 와이어프레임

### 2-1. FilterBar — gas 레이어 (세차장 칩 신설 + 기존 칩 개명)
```
┌──────────────────────────────────────────────────────────┐
│ [휘발유▼] [경유] [LPG] │ [⚡EV] [🚿세차장]   [전체브랜드▼]│  h≈44
└──────────────────────────────────────────────────────────┘
         유종/필터 그룹      ↑ 세로 구분선   ↑ 레이어 전환 그룹
  ※ gas 레이어에서만: 위 줄 우측 스크롤 영역에 [💧세차 가능] 토글 칩 포함
```
- `│` = `h-4 w-px bg-gray-200 dark:bg-gray-700`(레이어 그룹 시각 경계).
- `[💧세차 가능]` = 기존 부설 필터 칩(개명). DropletIcon 유지. gas 전용.
- `[🚿세차장]` = 신규 레이어 칩. CarwashIcon. EV 칩과 나란히, 동일 강조 로직.
- 요소 설명: 유종 칩은 `setProduct`(레이어 유지/복귀), EV·세차장 칩은 `setLayer`(상호배타 전환). 부설 '세차 가능'은 `toggleCarwashOnly`(gas 유지).

### 2-2. FilterBar — carwash 레이어 (재구성)
```
┌──────────────────────────────────────────────────────────┐
│ [휘발유▼] [경유] [LPG] │ [⚡EV] [🚿세차장]                 │  1행: 레이어 칩
├──────────────────────────────────────────────────────────┤
│  세차장 유형:  [전체] [셀프] [손세차] [자동]              │  2행: 유형 세그먼트
└──────────────────────────────────────────────────────────┘
```
- carwash 활성 시: 부설 '세차 가능' 칩·브랜드 필터(`BrandFilter`)는 **미렌더**(EV와 동형, AC-2.2). 유종 칩은 남겨두어(gas 복귀 진입점) 사용자가 언제든 주유소로 돌아갈 수 있게 함 — 유종 칩 탭 시 `setLayer('gas')`+`setProduct`.
- 2행 유형 세그먼트는 **carwash 레이어에서만** 등장(AC-3.1). `role="radiogroup"`, 각 버튼 `role="radio" aria-checked`. 선택 = primary, 미선택 = gray 칩.
- 좁은 화면: 2행은 `overflow-x-auto`, 4개라 대개 한 줄에 들어감.

### 2-3. 세차장 마커 (유형별 색·글리프)
```
   셀프          손세차/디테일     자동/기계식      유형 미확인
   ┌───┐         ┌───┐            ┌───┐            ┌───┐
   │ 🚿│파랑     │ ✋│보라        │ ⚙ │틸           │ ? │회색
   └─▼─┘         └─▼─┘            └─▼─┘            └─▼─┘
  #2563EB        #7C3AED          #0891B2          #9CA3AF
  줌인 라벨:  "셀프세차"      "손세차"        "자동세차"      "세차장"
```
- 물방울 핀(EV와 같은 드롭 실루엣) + 머리 원 안 흰색 유형 글리프. EV(초록 번개)·주유소(표정/숫자)와 색·글리프로 즉시 구분.
- 줌인(카카오 level ≤ 6) 시 핀 위 작은 라벨(유형 텍스트). 줌아웃은 핀만.
- 화면당 상한 `CARWASH_LIMIT = 200`(EV_LIMIT 유사). 초과 시 서버 limit로 잘림 → 빈 상태 아님, "축소 시 일부만 표시" 정책은 EV와 동일하게 침묵 처리.

### 2-4. CarwashPopup (마커 탭) — 모바일 하단 시트 / 데스크톱 중앙 카드
```
┌─────────────────────────────────┐
│ 🚿 셀프세차장            [ ✕ ]  │  유형 뱃지(색) + 닫기(44px)
│ 스마트셀프카워시                │  이름(bold)
├─────────────────────────────────┤
│ 📍 서울 강남구 봉은사로 123      │  주소(road_addr, 없으면 jibun)
│ 📞 02-123-4567                  │  전화(있을 때만 · 탭=전화걸기)
│ 🕒 평일 08:00~22:00             │  운영시각(있을 때만)
│ 💰 셀프 5,000원~                │  요금(있을 때만)
├─────────────────────────────────┤
│ [   🧭 길안내   ]               │  primary CTA(카카오내비/맵)
├─────────────────────────────────┤
│ 공공데이터 기준이라 실제와 다를 │  노후 고지 + 출처(AC-2.6·2.8)
│ 수 있어요 · 출처: 행정안전부      │
│ 전국세차장표준데이터            │
└─────────────────────────────────┘
```
- 유형 뱃지: `🚿 셀프세차장 / ✋ 손세차·디테일 / ⚙ 자동세차 / ？ 유형 미확인`. 색은 §2-3 팔레트. unknown은 회색 + "유형 미확인"(AC-2.5).
- **조건부 렌더**: 전화/운영시각/요금은 값이 있을 때만 라벨째 렌더(AC-2.3·2.4). undefined/null/빈문자 노출 금지 — `value && (<Row.../>)` 패턴.
- 주소 우선순위: `road_addr ?? jibun_addr`. 둘 다 없으면 주소 행 생략.
- CTA는 **길안내 단독**(상세 페이지 없음 — plan Out). Ev 팝업의 "상세보기" 자리 제거.
- 데스크톱: `EvStationPopup`과 동일한 중앙 모달(`fixed inset-0 ... items-center`). 모바일: 하단 앵커 시트(`items-end`, `rounded-t-2xl`, `pb-[env(safe-area-inset-bottom)]`)로 한 손 도달성 확보.

### 2-5. 빈 상태 (carwash 레이어, 결과 0건)
```
┌─────────────────────────────────┐
│            [지도]                │
│                                 │
│   ┌───────────────────────────┐ │
│   │ 🚿 이 지역에 표시할        │ │  중앙 하단 오버레이 카드
│   │    세차장이 없어요.        │ │  (반투명 배경, 지도 간섭 최소)
│   │    지도를 옮기거나         │ │
│   │    축소해 보세요.          │ │
│   └───────────────────────────┘ │
└─────────────────────────────────┘
```

### 2-6. 범례(ⓘ) — carwash 변형 (MarkerLegend 확장)
```
세차장 마커 안내
─────────────────
유형 = 핀 색·아이콘
 🚿 파랑  셀프세차
 ✋ 보라  손세차·디테일
 ⚙ 틸    자동·기계식
 ？ 회색  유형 미확인 (공공데이터 미기재)
─────────────────
※ 공공데이터 기준이라 폐업·정보가 다를 수 있어요.
   출처: 행정안전부 전국세차장표준데이터
```

---

## 3. 컴포넌트 매핑

### 재사용 (수정 없음 / 패턴 참조)
- `components/map/EvStationPopup.tsx` → **패턴 복제 원본**. 헤더(유형 라벨+이름+닫기 44px), 본문 카드, 하단 CTA 구조·클래스를 그대로 따르되 필드만 세차장용으로 교체.
- `components/ui/BottomSheet.tsx` → 모바일 CarwashPopup을 시트형으로 띄울 때 앵커/드래그 톤 참조(또는 팝업 자체를 `items-end` 모달로 구현 — 둘 중 구현 단순한 쪽 채택, 시각 결과 동일).
- `components/carwash/CarwashDayCard.tsx` → **면책·출처 카피 톤**(`예보 기반 참고용 지수입니다 · 출처: 기상청`)을 세차장 고지 문구의 문체 기준으로 재사용. 등급 배지 색 클래스(`GRADE_CLASS`)의 라이트/다크 페어 패턴을 유형 뱃지 색 정의에 참고.
- `stores/map.ts`의 `MapLayer`·`carwashOnly` 토글 패턴, `components/icons/index.tsx`의 `Stroke`/`Fill` 래퍼 규격.

### 수정
- `stores/map.ts`
  - `export type MapLayer = 'gas' | 'ev'` → `'gas' | 'ev' | 'carwash'` 추가(plan FR-2).
  - 신규 상태: `carwashType: 'all' | 'self' | 'hand' | 'auto'`(기본 `'all'`) + `setCarwashType(t)`. `carwashOnly`(부설 필터)와 **완전 별개**임을 주석으로 명시(혼동 방지).
- `components/ui/FilterBar.tsx`
  - 기존 '세차' 칩 라벨 문자열 `세차` → `세차 가능`(개명, DropletIcon 유지). 나머지 로직 불변.
  - EV 칩 다음에 **'세차장' 레이어 칩** 추가: `onClick={() => setLayer('carwash')}`, `aria-pressed={layer==='carwash'}`, `CarwashIcon` + "세차장". EV 칩과 동일 강조 클래스.
  - 유종/필터 그룹과 레이어 그룹 사이 **세로 구분선** 삽입.
  - carwash 레이어일 때: 부설 '세차 가능' 칩·`BrandFilter` 미렌더(`!isEv` 조건을 `layer==='gas'`로 정교화 — EV/carwash 공통으로 숨김). 대신 **2행 유형 세그먼트** 렌더(carwash 한정).
  - 유종 칩 `selectFuel`: `isEv` 분기를 `layer !== 'gas'`로 일반화해 carwash에서도 gas 복귀하도록.
- `components/map/KakaoMap.tsx`
  - `layer` prop 타입에 `'carwash'` 추가. 기존 `if (layer === 'ev') return`류 게이팅을 `layer !== 'gas'`로 일반화(주유소 마커·TOP10·회색점을 carwash에서도 억제).
  - 신규 props: `carwashPlaces?: CarwashMarker[]`, `onCarwashMarkerClick?`. EV 오버레이 effect와 동형의 carwash 오버레이 effect 추가(`buildCarwashMarkerContent` 사용, level ≤ 6 라벨).
- `components/ui/MarkerLegend.tsx`
  - `layer === 'carwash'` 분기 추가(§2-6 내용). EV/gas와 3-way. `CarwashPinChip` 4색 헬퍼 추가(EvPinChip 패턴).
- `app/page.tsx`
  - `carwashPlaces` 상태 + `fetchCarwashPlaces(bbox)`(EV `fetchEvStations` 복제, `/api/carwash/bbox`). `layer` effect·`onBoundsChange`에 carwash 분기.
  - `carwashPopup` 상태 + `<CarwashPopup>` 렌더. **모바일도 팝업**(EV처럼 상세 페이지로 라우팅하지 않음 — 상세 없음).
  - `carwashType`로 클라이언트 필터(`carwashPlaces.filter(...)`) 적용해 마커 전달(FR-3 기본안).
  - 빈 상태 오버레이 배너 렌더 조건: `layer==='carwash' && !loading && filtered.length===0`.

### 신규 (재사용 불가 사유 포함)
- `components/map/CarwashPopup.tsx` — 사유: EvStationPopup은 충전기 대수/급속·완속 등 EV 전용 요약을 강하게 전제(필드·CTA 상이). 세차장은 유형 뱃지·조건부 운영/요금·단일 CTA·출처 고지 구조라 별 컴포넌트가 명확. **props**: `{ place: CarwashMarker; onClose(): void; onNavigate(): void; }`.
- `lib/map/carwashMarker.ts` — 사유: `evMarker.ts`는 사용가능 여부(초록/회색)·급속 뱃지 로직 전용. 세차장은 유형 4색+글리프라 별 빌더. **export**: `buildCarwashMarkerContent(place, showLabel): HTMLDivElement`, 유형→색/글리프 맵.
- `types/carwash.ts` — `CarwashMarker { mgmtNo; name; washType: 'self'|'hand'|'auto'|'unknown'; roadAddr; jibunAddr; tel?; weekdayOpen?; weekdayClose?; feeInfo?; closedDay?; lat; lng; dataBaseDate?; syncedAt?; }` + `CarwashBboxResponse` + `WASH_TYPE_LABEL`/`WASH_TYPE_COLOR` 상수. (API/DB 계약과 공유.)
- `CarwashIcon`(components/icons/index.tsx에 추가) — 사유: 부설 필터의 DropletIcon과 반드시 형태가 달라야 함. 제안 형태: **차체 실루엣 + 위에서 내려오는 분사선 3줄**(세차=차를 씻는다) 또는 기존 `CarIcon` + `SparklesIcon` 조합. Stroke 규격(viewBox 0 0 24 24, currentColor). 마커 글리프(흰색)는 유형별로 셀프=분사노즐/손세차=손/자동=기어 — 인라인 SVG 문자열로 `carwashMarker.ts`에 둠.

---

## 4. 스타일 지침 (Tailwind 방향)

### 색 팔레트 (유형별 — 라이트/다크 페어)
| 유형 | 핀/뱃지 색 | 라이트 뱃지 클래스 | 다크 뱃지 클래스 |
|---|---|---|---|
| 셀프(self) | `#2563EB` blue | `bg-blue-50 text-blue-700 border-blue-200` | `dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800` |
| 손세차(hand) | `#7C3AED` violet | `bg-violet-50 text-violet-700 border-violet-200` | `dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800` |
| 자동(auto) | `#0891B2` cyan | `bg-cyan-50 text-cyan-700 border-cyan-200` | `dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800` |
| 미확인(unknown) | `#9CA3AF` gray | `bg-gray-100 text-gray-600 border-gray-200` | `dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700` |
- EV 초록(`#16A34A`)·주유소 가격 tier 색과 **겹치지 않게** blue/violet/cyan 선택(급속 앰버 뱃지와도 구분).
- 색만으로 의미 전달 금지: 마커는 색+글리프, 팝업/범례는 색+텍스트 라벨 병기(접근성).

### 칩·세그먼트
- 칩: 기존 그대로 `rounded-full px-3 py-1.5 text-xs font-semibold transition`, 활성 `bg-primary text-white`, 비활성 `bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`.
- 유형 세그먼트(2행): 동일 칩 스타일. 컨테이너 `flex gap-1.5 px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900`(FilterBar 배경 연속). 좌측에 작은 라벨 "세차장 유형" `text-[11px] text-gray-500`.
- 아이콘 크기 칩 내부 `h-3.5 w-3.5`(EV 칩과 동일).

### 팝업
- 컨테이너: `rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-900`(EvStationPopup 동일). 모바일 시트 변형: `rounded-t-2xl` + `pb-[calc(1.25rem+env(safe-area-inset-bottom))]`.
- 유형 뱃지: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold` + 위 표 색 클래스.
- 정보 행: `flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300`, 아이콘 `PinIcon`/`PhoneIcon`/`ClockIcon` + `CoinIcon`(요금) `h-4 w-4 text-gray-400`.
- CTA: `w-full rounded-xl bg-primary py-3 text-sm font-bold text-white`(EV 상세 버튼 톤). 전화 CTA는 `<a href="tel:...">`로 감싸 접근성 보장.
- 고지: `mt-3 text-[10px] text-gray-400 dark:text-gray-500`(CarwashDayCard disclaimer 톤).

### 다크모드
- 모든 신규 요소 `dark:` 페어 필수(위 표/클래스에 포함). 지도 오버레이 마커는 흰색 글리프+drop-shadow라 라이트/다크 지도 배경 모두에서 대비 확보(EV 마커와 동일 전략).

### 모바일 safe-area · 터치 타깃
- 팝업 닫기 버튼 `h-11 w-11`(44px, EvStationPopup 그대로).
- 칩 세로 패딩 `py-1.5`(약 30px)이나 히트영역이 작을 수 있어 세그먼트 행은 `py-2`로 여유. 마커 탭 대상은 핀 전체(28~36px) — 근접 밀집 시 오탭 방지 위해 핀 최소 크기 유지.
- 하단 시트/배너 `env(safe-area-inset-bottom)` 반영. 빈 상태/토스트는 `bottom-[calc(...safe-area...)]`.
- 지도 위 오버레이(빈 상태 배너, 토스트)는 반투명·중앙 하단 배치로 지도 조작(줌/내위치 버튼 right-3) 간섭 최소화.

### 접근성 레이블
- '세차장' 칩: 텍스트 "세차장" 노출(아이콘 단독 금지). `aria-pressed`.
- 유형 세그먼트: `role="radiogroup" aria-label="세차장 유형"`, 각 `role="radio" aria-checked`.
- 마커: 카카오 오버레이라 스크린리더 접근 제한 → 팝업 `role="dialog" aria-modal aria-label="{이름} 세차장 정보"`로 보완(EvStationPopup 패턴).
- 색 대비: 뱃지 텍스트/배경 WCAG AA 충족(50 배경 + 700 텍스트, 다크 950+300).

---

## 5. 상태·엣지 케이스 (AC 대응)

| 상황 | 화면 | 관련 AC |
|---|---|---|
| carwash 진입, 로딩 중 | 지도 유지 + 얇은 상단 진행 인디케이터(선택) 또는 이전 마커 유지 후 교체. 무한 로딩·스켈레톤 없음(EV와 동일 톤). | AC-1.2, 2.7 |
| bbox 결과 0건 / 미적재 | §2-5 빈 상태 오버레이. 크래시·에러 없음. | AC-1.2, 2.7 |
| Mock 모드(`NEXT_PUBLIC_USE_MOCK`) | mock 마커 표시 또는 빈 상태. 콘솔 에러 0. 유형 필터도 mock에서 동작. | AC-1.1, 2.7, 3.5 |
| 전화번호 없음 | 팝업에 전화 행·CTA 미렌더(빈 버튼 금지). | AC-2.3 |
| 운영시각·요금 없음(대다수) | 해당 라벨 자체 미렌더. | AC-2.4 |
| wash_type=unknown | 회색 핀 + 팝업 뱃지 "유형 미확인". 전체 필터에서 표시. | AC-2.5, 3.4 |
| 노후/폐업 가능 데이터 | 팝업·범례 고지 문구 상시 노출. | AC-2.6 |
| 출처 | 팝업·범례에 "행정안전부 전국세차장표준데이터" 표기. | AC-2.8 |
| 셀프 필터 선택 | self 핀만, unknown 숨김. 전체 복귀 시 복원. | AC-3.2, 3.3 |
| 레이어 전환(gas↔carwash) | carwash 시 주유소 가격 마커 사라짐, 칩 aria-pressed. 부설 '세차 가능' 칩·브랜드 필터 숨김 → gas 복귀 시 복원. | AC-2.1, 2.2 |
| 오프라인/네트워크 실패 | fetch 실패 시 이전 마커 유지 + (선택) 조용한 재시도. 콘솔 warn만, 사용자 배너는 빈 상태와 구분해 "불러오지 못했어요" 토스트(EV와 동일 수준). | (안정성 지표) |
| 데스크톱 vs 모바일 팝업 | 데스크톱 중앙 카드, 모바일 하단 시트. 둘 다 상세 페이지 라우팅 없음. | FR-2 |

---

## 6. 미해결 / 리스크

1. **유형 필터: 클라이언트 vs 서버** — plan 기본안(클라이언트 필터) 채택 가정으로 UI 설계. 단 `CARWASH_LIMIT=200`과 상호작용 주의: 서버가 유형 무관 200개를 보내고 클라이언트가 self만 남기면 화면에 너무 적게 보일 수 있음. → 대안: 유형 선택 시 서버 `type=` 파라미터 병행(재조회). UI는 둘 다 동일하게 보이므로 구현 성능 실측 후 결정(plan 리스크 5).
2. **'세차 가능' 개명 파급** — 기존 계측 이벤트 `carwash_filter_on`·QA 문서·`CarwashDayCard` CTA("세차 되는 최저가 주유소 보기")와 라벨 정합성 확인 필요. 개명은 표시 문자열만, 이벤트 키는 불변 권장.
3. **CarwashIcon 최종 형태** — 물방울과 확실히 구분되는 픽토그램을 개발 시 확정(차체+분사 vs Car+Sparkles 조합). 마커 유형 글리프(셀프 노즐/손/기어)도 소형(20px)에서 판독성 테스트 필요.
4. **마커 밀집 클러스터링 없음** — EV와 동일하게 줌 게이팅만. 도심에서 200개 상한 초과 세차장 밀집 시 일부 미표시 → 사용자에게 침묵. 클러스터/카운트 뱃지는 후속.
5. **모바일 팝업 상세 부재** — 상세 페이지가 없어 팝업이 종착점. 운영/요금 채움률 낮아(10%/5%) 팝업이 빈약해 보일 수 있음 → 유형·주소·길안내만으로도 실사용 가치는 충족(길찾기 목적). 정보 확충은 크라우드소싱(후속).
6. **유형 미확인 62%** — 지도 상당수가 회색 핀·"세차장" 중립 라벨. "미확인이 많아 유형 필터 효용이 제한적"임을 사용자가 오해하지 않도록 세그먼트 옆 (선택) "미확인 N곳은 특정 유형 선택 시 숨겨져요" 힌트 검토(plan FR-3). v1은 범례 문구로 갈음.
7. **접근성(지도 마커)** — 카카오 CustomOverlay는 스크린리더 접근이 제한적. 팝업 dialog로 보완하나, 마커 자체의 키보드 접근은 미해결(EV·주유소 마커도 동일한 기존 한계).
```
