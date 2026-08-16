# 디자인 명세: 세차 묶음 — 세차 필터 칩 + "세차하기 좋은 날" 홈 미니 카드 + 세차 배지

> 담당: UI/UX 디자인. 근거: 같은 폴더 `plan.md`(FR-1~FR-3), `research.md` §4 C2.
> 코드 실측 기준(2026-08-16 작업 트리): `components/ui/FilterBar.tsx`, `components/ui/BottomSheet.tsx`,
> `components/forecast/ForecastCard.tsx`, `components/alert/RadiusAlert.tsx`, `components/notice/NoticePopup.tsx`,
> `app/page.tsx`, `app/station/[id]/page.tsx`, `components/icons/index.tsx`.
>
> **경로 정정**: plan.md의 "components/map/BottomSheet.tsx"는 실제로 **`components/ui/BottomSheet.tsx`**다. 이 문서는 실제 경로 기준으로 쓴다.

---

## 화면 흐름

### 흐름 A — 세차 필터 (FR-1, 유저 스토리 1)

1. **진입**: 홈(`/`) gas 레이어. FilterBar 칩 열 = `[휘발유▾][경유][LPG][EV][세차]` + 우측 고정 `[브랜드]`.
   - "세차" 칩은 EV 칩 **뒤**(스크롤 행의 마지막), EV 레이어에서는 렌더하지 않음(AC-1).
2. **행동**: "세차" 칩 탭 → 활성 스타일(`bg-primary text-white`, 기존 칩과 동일) + `aria-pressed=true` + `track('carwash_filter_on')`.
3. **결과**:
   - bbox/radius 재조회(`carwash=1`) → 지도 마커·하단 시트 목록이 세차 가능 주유소만으로 갱신(가격 오름차순 유지).
   - 회색 점 레이어(전체 주유소)는 숨김 — 표시 집합 일관성.
   - 하단 시트 타이틀이 세차 문맥으로 바뀜: `이 지역 세차 가능 최저가 TOP N` / `내 주변 1km 세차 가능 최저가`.
   - 각 목록 행에 "세차" 배지 표시(AC-2).
4. **해제**: 칩 재탭 → 비활성 스타일, 전체 조회 복귀, 배지·타이틀 원복.
5. **상세 확인**: 목록 행 "상세" 탭 → `/station/[id]` 부가서비스 섹션에서 "세차장" 배지 확인. 미보강 주유소는 "부가서비스 정보 확인 중입니다" 문구(AC-5, 흐름 D).

### 흐름 B — 홈 "세차하기 좋은 날" 카드 (FR-3, 유저 스토리 2)

1. **진입**: 홈 gas 레이어에서 지도 아래로 스크롤(ForecastCard와 같은 흐름 영역). 지수 데이터가 있으면 카드 노출, 없으면 미렌더(AC-3).
2. **확인**: 제목("이번 주 세차하기 좋은 날: **토요일**") + 등급 배지(좋음/보통/나쁨 라벨 병기) + 근거 한 줄("토요일 강수확률 10% · 일요일 70%") + 4일 요일 스트립 + "서울 기준" 라벨 + 면책·출처 문구.
3. **행동(딥링크, 유저 스토리 3)**: CTA "세차 되는 최저가 주유소 보기" 탭 →
   `track('carwash_card_click', { bestDay, grade })` → `carwashOnly=true`(세차 칩 활성) → 화면을 지도 최상단으로 스크롤 → 하단 시트 펼침 → 세차 가능 최저가 목록(AC-2, 1초 내).
4. **해제**: 카드 우측 상단 "오늘 하루 숨김" 탭 → 즉시 언마운트, localStorage에 KST 당일 기록(NoticePopup `hideKey`/`kstToday` 패턴) → 당일 재방문 시 미노출, 익일(KST) 재노출(AC-4).

### 흐름 C — 모든 날이 나쁨 (FR-3 분기)

1. 4일 전부 `bad` → 제목이 "이번 주는 세차를 미루는 게 좋겠어요"로 바뀌고 등급 배지는 "나쁨".
2. 근거 한 줄은 가장 큰 감점 요인 표기(예: "나흘 내내 강수확률 60% 이상").
3. CTA는 유지(세차 여부와 무관하게 주유소 탐색 가치는 있음) — 단 시각 위계를 낮춘 보조 스타일.

### 흐름 D — 상세 페이지 문구 (FR-1 AC-5)

1. `/station/[id]` 부가서비스 섹션:
   - `amenitiesUpdatedAt == null`(미보강) → **"부가서비스 정보 확인 중입니다"** (현행 "부가서비스 정보가 아직 수집되지 않았습니다."를 이 문구로 교체 — AC-5 문구와 일치시킴, 분기 로직은 이미 존재).
   - `amenitiesUpdatedAt != null` && 보유 항목 0 → 기존 "제공되는 부가서비스가 없습니다." 유지.
   - 보유 항목 있음 → 기존 emerald 배지 목록 유지(변경 없음).

**FR 커버리지**: FR-1 → 흐름 A·D. FR-3 → 흐름 B·C. **FR-2(데이터 파이프라인)는 UI 없음**(배치·API) — 단, FR-2의 산출물(`days[]`, `best`, `popMax`, `dustGrade`, `regionName`)이 카드의 표시 항목으로 전부 소비되는 구조를 본 명세가 정의한다.

---

## 와이어프레임

### 1. FilterBar — 세차 칩 (gas 레이어)

칩 OFF (기본):
```
┌────────────────────────────────────────────────────┐
│ (휘발유 ▾) (경유) (LPG) (⚡EV) (💧세차)   [브랜드] │  h=44, px-3 py-2
└────────────────────────────────────────────────────┘
   ▲활성(주황)   ▲▲▲ 비활성: bg-gray-100        ▲ BrandFilter(우측 고정)
   * (💧)는 이모지가 아니라 DropletIcon SVG 표기용 기호
   * 좁은 화면: 경유~세차 구간이 가로 스크롤(기존 overflow-x-auto 행 안에 배치)
```

칩 ON:
```
│ (휘발유 ▾) (경유) (LPG) (⚡EV) (💧세차)   [브랜드] │
                                 ▲ bg-primary, 흰 글자, aria-pressed=true
```
- 칩 구성: `DropletIcon(h-3.5 w-3.5)` + "세차" 텍스트. EV 칩과 동일한 `flex items-center gap-0.5 rounded-full px-3 py-1.5 text-xs font-semibold`.
- **세차 칩은 레이어 토글이 아니라 필터 토글** — EV 칩(`setLayer`)과 달리 유종 선택을 바꾸지 않는다. 세차+브랜드 동시 ON 가능(AC-3, AND 교집합).
- EV 레이어에서는 `{!isEv && ...}`로 미렌더(BrandFilter와 동일 조건).

### 2. 하단 시트 — 세차 배지 + 세차 문맥 타이틀

칩 ON, 결과 있음:
```
┌────────────────────────────────────────────────────┐
│ ── 이 지역 세차 가능 최저가 TOP 7        펼치기 ▴ │
│ (이 지역)(내 주변 1km)                             │
│ ─────────────────────────────────────────────────  │
│ 1 ● GS 신논현셀프 [세차]           ₩1,580   [내비]│
│     GS칼텍스 · 셀프 · 600m            상세 ›       │
│ ─────────────────────────────────────────────────  │
│ 2 ● 알뜰 역삼셀프 [세차]           ₩1,612   [내비]│
│     알뜰 · 셀프 · 1.1km               상세 ›       │
└────────────────────────────────────────────────────┘
  [세차] = emerald 필 배지(주유소명 오른쪽, 전국N위 배지와 같은 슬롯)
```

칩 ON, 결과 0곳 (AC-4 빈 상태):
```
┌────────────────────────────────────────────────────┐
│ ── 이 지역 세차 가능 최저가 TOP 0        펼치기 ▴ │
│                                                    │
│        💧 (DropletIcon, h-8 w-8, text-gray-300)    │
│   이 지역엔 세차 가능으로 확인된 주유소가          │
│   아직 없어요 — 정보 수집 중                       │
│   [세차 필터 끄기]  ← 탈출구(텍스트 버튼, primary) │
└────────────────────────────────────────────────────┘
```
- 배지는 칩 OFF 상태에서도 `hasCarwash=true`인 행에 항상 표시(RPC 반환 컬럼 추가로 데이터가 생기므로). 칩 ON일 때는 전 행에 붙어 "필터가 걸려 있음"을 확인시켜 준다(AC-2).
- 배지 겹침 규칙: 주유소명(truncate) → 전국N위 배지 → 세차 배지 순. 둘 다 있으면 세차 배지가 뒤. 배지들은 `shrink-0`, 이름만 줄어든다.

### 3. 홈 "세차하기 좋은 날" 카드 — good 상태

```
┌──────────────────────────────────────────────────┐  mx-3 rounded-2xl
│ 💧 세차하기 좋은 날 · 서울 기준    오늘 하루 숨김│  헤더행(11px 회색)
│                                                  │
│ 이번 주 세차하기 좋은 날: 토요일   [● 좋음]      │  제목(15px bold)+등급 배지
│ 토요일 강수확률 10% · 일요일 70%                 │  근거 한 줄(13px)
│                                                  │
│ ┌──────┬──────┬──────┬──────┐                    │  4일 요일 스트립
│ │ 오늘 │ 내일 │  금  │  토  │                    │
│ │ 보통 │ 나쁨 │ 좋음 │ 좋음 │  ← 등급 필(라벨)   │
│ │ 40%  │ 80%  │ 20%  │ 10%  │  ← 강수확률        │
│ └──────┴──────┴──────┴──────┘                    │
│                                                  │
│ [   세차 되는 최저가 주유소 보기  ›   ]          │  CTA(w-full, primary)
│ 예보 기반 참고용 지수입니다 · 출처: 기상청       │  면책(10px, gray-400)
└──────────────────────────────────────────────────┘
```

모든 날 bad 상태 (흐름 C):
```
┌──────────────────────────────────────────────────┐
│ 💧 세차하기 좋은 날 · 서울 기준    오늘 하루 숨김│
│ 이번 주는 세차를 미루는 게 좋겠어요  [● 나쁨]    │
│ 나흘 내내 강수확률 60% 이상                      │
│ ┌──────┬──────┬──────┬──────┐                    │
│ │ 오늘 │ 내일 │  금  │  토  │                    │
│ │ 나쁨 │ 나쁨 │ 나쁨 │ 나쁨 │                    │
│ │ 70%  │ 90%  │ 60%  │ 80%  │                    │
│ └──────┴──────┴──────┴──────┘                    │
│ [   세차 되는 최저가 주유소 보기  ›   ]  ← 보조 스타일│
│ 예보 기반 참고용 지수입니다 · 출처: 기상청       │
└──────────────────────────────────────────────────┘
```
- **배치**: absolute 오버레이가 아니라 **문서 흐름**. `app/page.tsx`의 지도 컨테이너(첫 뷰포트) **아래**, `{layer === 'gas' && <ForecastCard/>}`(현행 1113행) **바로 위**에 `{layer === 'gas' && <CarwashDayCard/>}`. 세로 스택: 지도(오버레이 포함) → **CarwashDayCard** → ForecastCard → BusinessFooter.
  - 이 배치로 RadiusAlert(z-30 상단 오버레이)·BottomSheet(z-20 하단)·BannerAd와 **구조적으로 겹칠 수 없다**(AC-6). z-index 신규 부여 불필요.
  - CarwashDayCard를 ForecastCard 앞에 두는 이유: 카드가 더 컴팩트하고(스크롤 1스텝에 전체 노출) 시한성 정보(이번 주)라 먼저 보이는 게 유리. ForecastCard의 `?forecast=1` 딥링크는 `scrollIntoView(ref)`라 순서 변경에 영향 없음.
- **4일 스트립**: `grid grid-cols-4` 균등 분할. 셀 = 요일(오늘/내일은 상대 표기, 이후는 요일 한 글자) + 등급 필(색+**라벨 텍스트 병기**) + POP%. 최고점 날 셀은 `ring-1 ring-primary/40` + 요일 bold로 강조. `dustGrade`가 '나쁨' 이상으로 감점된 날은 POP% 아래가 아닌 등급 필의 title/aria에 반영하고, 근거 한 줄에서 서술("토요일 미세먼지 나쁨").
- **근거 한 줄 생성 규칙**(카피 원칙 — 단정 금지, AC-5):
  - best가 good/fair: `"{best요일} 강수확률 {popMax}%"` + 감점 요인이 있으면 ` · {요일} {요인}`(예: "일요일 70%", "토요일 미세먼지 나쁨"). 익일 POP 감점이 best 선정에 영향 준 경우 그 요일 POP를 병기.
  - 전부 bad: 지배 요인 요약("나흘 내내 강수확률 60% 이상" / "미세먼지 나쁨이 이어져요").
  - 금지: "비 옵니다/안 옵니다", "맑음 보장" 류 단정 표현. 항상 "강수확률 N%", "미세먼지 {등급}" 형식.
- **"오늘 하루 숨김"**: 텍스트 버튼(레이블 그대로 — 아이콘 단독 금지). 히트 영역은 `-m-2 p-2`로 44px 확보.

### 4. 상세 페이지 — 부가서비스 문구 (흐름 D)

```
미보강(amenitiesUpdatedAt=null):        수집됐지만 전부 미보유:
┌────────────────────────────┐          ┌────────────────────────────┐
│ 부가서비스                 │          │ 부가서비스                 │
│ ┌────────────────────────┐ │          │ ┌────────────────────────┐ │
│ │ 부가서비스 정보        │ │          │ │ 제공되는 부가서비스가  │ │
│ │ 확인 중입니다          │ │          │ │ 없습니다.              │ │
│ └────────────────────────┘ │          │ └────────────────────────┘ │
└────────────────────────────┘          └────────────────────────────┘
  (기존 회색 안내 박스 스타일 그대로, 문구만 교체)
```

---

## 컴포넌트 매핑

### 재사용 (그대로 씀)

| 기존 자산 | 사용처 |
|---|---|
| `components/ui/FilterBar.tsx`의 EV 칩 마크업/클래스(139~152행) | 세차 칩의 시각·구조 원형. `aria-pressed`, 활성/비활성 클래스 문자열 그대로 복제 |
| `stores/map.ts` `brands`/`toggleBrand` 패턴 | `carwashOnly: boolean` + `toggleCarwashOnly()` — 동형 토글, 세션 저장 불필요 |
| `components/ui/BottomSheet.tsx` EvRow "급속" 배지(296~298행)의 필 배지 구조 | 세차 배지 마크업 원형(`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none`) |
| `app/station/[id]/page.tsx` AmenityList emerald 배지 톤(184행) | 세차 배지 색상 출처(emerald 라이트/다크 쌍) |
| `components/forecast/ForecastCard.tsx` 카드 셸(`mx-3 rounded-2xl border … shadow-sm`), graceful 미렌더 패턴, `useEffect+fetch+AbortController` 페칭 | CarwashDayCard의 셸·수명주기 원형. ※ plan.md는 TanStack Query를 언급하나 **코드베이스에 react-query 미도입**(ForecastCard 주석 명시) — 기존 fetch 패턴을 따를 것 |
| `components/notice/NoticePopup.tsx` `kstToday()`/`hideKey()` localStorage 패턴 | "오늘 하루 숨김" 구현 원형. 키: `carwashCardHideUntil`(값=KST 'YYYY-MM-DD') |
| `lib/analytics.ts` `track()` | `carwash_filter_on`, `carwash_card_click` |

### 수정

| 경로 | 변경 |
|---|---|
| `components/ui/FilterBar.tsx` | 스크롤 행(121~154행) EV 칩 뒤에 세차 칩 추가. `!isEv`일 때만 렌더. 탭 시 `toggleCarwashOnly()` + OFF→ON 전이에만 `track('carwash_filter_on')` |
| `components/ui/BottomSheet.tsx` | ① 행에 세차 배지(`s.hasCarwash` — `StationWithPrice` 타입에 필드 추가 필요) ② `carwashOnly` prop 수용: 타이틀 문구 전환 + 빈 상태 문구 교체 + "세차 필터 끄기" 탈출 버튼 ③ **CTA 딥링크용 시트 열기 수단**: `openSignal?: number` prop(값 증가 시 `setOpen(true)` + `onOpenChange` 통지) — 현재 open이 내부 상태라 외부에서 못 여는 문제 해결(최소 침습) |
| `app/page.tsx` | ① fetch 파라미터에 carwash 결합(329·479행 부근) ② `carwashOnly ? [] : visibleAllStations`(회색 점 숨김, 568행 부근) ③ 1113행 ForecastCard 위에 `{layer === 'gas' && <CarwashDayCard …/>}` ④ CTA 콜백: `window.scrollTo({top:0,behavior:'smooth'})` + BottomSheet `openSignal` 증가 |
| `stores/map.ts` | `carwashOnly` + `toggleCarwashOnly` + `setCarwashOnly`(카드 CTA는 명시적 true 세팅) |
| `app/station/[id]/page.tsx` | 130~132행 문구를 "부가서비스 정보 확인 중입니다"로 교체 + 안내 박스 2종에 `dark:bg-gray-800 dark:text-gray-400` 추가(현행 다크 변형 누락) |
| `components/icons/index.tsx` | **DropletIcon 신규**(stroke형, Lucide `droplet`): 물방울 한 개 외곽선 — `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>`. 파일 규격(viewBox 24, currentColor, className만) 준수. 세차=물방울 단독으로 충분히 식별되고("세차" 라벨 상시 병기), 자동차+물방울 복합형은 14px에서 뭉개져 배제 |

### 신규

| 제안 경로 | 책임 / props |
|---|---|
| `components/carwash/CarwashDayCard.tsx` | 단일 신규 컴포넌트(기존에 "지수 카드"에 해당하는 재사용 대상이 없음 — ForecastCard는 유종·그래프 결합이 강해 셸만 차용). 책임: `/api/carwash-index` 조회(좌표: `useGeolocation` → `lastView` → 서울 폴백), 오늘 하루 숨김 판정, 카드 렌더(제목/등급 배지/근거/4일 스트립/CTA/면책), `carwash_card_click` 계측. props: `{ onCta: () => void }` — 스토어 세팅·스크롤·시트 열기는 부모(app/page.tsx)가 콜백으로 수행(카드는 지도 내부 구현을 모름). 데이터 없음·숨김이면 `return null` |

---

## 스타일 지침

### 세차 칩 (FilterBar)

```
비활성: bg-gray-100 text-gray-700 hover:bg-gray-200
        dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700
활성:   bg-primary text-white
공통:   flex shrink-0 items-center gap-0.5 rounded-full px-3 py-1.5
        text-xs font-semibold transition + aria-pressed
아이콘: <DropletIcon className="h-3.5 w-3.5" /> — currentColor 상속(활성 시 흰색)
```
- 칩 자체 높이는 EV 칩과 동일(~30px)이지만 FilterBar 행 전체(py-2 포함 44px)가 터치 대상이고 칩 간 gap-1.5로 오탭 여지가 작아 기존 관례 유지.

### 세차 배지 (BottomSheet 행 / 상세와 톤 정합)

```
inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5
text-[10px] font-bold leading-none
bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300
내용: <DropletIcon className="h-3 w-3" />세차   ← 아이콘+텍스트, 아이콘 단독 금지
```
- AmenityList(emerald-50/700 · dark emerald-950/300)와 동일 팔레트 → 목록↔상세 시각 연속성.
- 전국N위 골드 배지와 나란히 놓여도 채도 충돌 없음(emerald 파스텔 vs amber 그라데이션).

### 등급 색 (good/fair/bad) — 카드 문맥 한정 + 라벨 필수

| 등급 | 라벨 | 라이트 | 다크 |
|---|---|---|---|
| good | 좋음 | `bg-emerald-50 text-emerald-700 border border-emerald-200` | `dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800` |
| fair | 보통 | `bg-amber-50 text-amber-700 border border-amber-200` | `dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800` |
| bad | 나쁨 | `bg-rose-50 text-rose-600 border border-rose-200` | `dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900` |

- **색 단독 전달 금지**: 등급 필·배지에는 항상 "좋음/보통/나쁨" 텍스트를 병기한다(색각이상 대응 + AC 접근성). 대비: emerald-700 on emerald-50 ≈ 6.4:1, amber-700 on amber-50 ≈ 6.2:1, rose-600 on rose-50 ≈ 5.3:1 — 본문 기준 AA 충족. 다크 쌍(300 on 950)도 동일 관례(EvRow 급속 배지, AmenityList)로 기검증.
- **초록 혼동 방지**: good의 emerald는 **카드/배지 컨텍스트 안에서만** 사용하고 지도 마커·가격 텍스트(`text-cheap`)에는 절대 쓰지 않는다. 카드가 지도 밖(스크롤 흐름)에 있어 마커 초록(=최저가)과 화면상 동시 노출 빈도가 낮고, 라벨 병기로 의미가 고정된다.

### CarwashDayCard 셸·타이포

```
셸:    mx-3 mb-3 mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm
       dark:border-gray-800 dark:bg-gray-900        (ForecastCard와 동일)
헤더행: flex items-center justify-between
       좌: <DropletIcon className="h-4 w-4" /> 세차하기 좋은 날 · {regionName} 기준
           text-[11px] font-medium text-gray-500 dark:text-gray-400
       우: "오늘 하루 숨김" — text-[11px] text-gray-400 hover:text-gray-600
           dark:hover:text-gray-300, 히트영역 -m-2 p-2 (≥44px)
제목:  mt-1.5 text-[15px] font-bold text-gray-900 dark:text-gray-100
       + 등급 배지(위 표, rounded-full px-2 py-0.5 text-xs font-bold)
근거:  mt-1 text-[13px] text-gray-600 dark:text-gray-300
스트립: mt-3 grid grid-cols-4 gap-1.5 · 셀 rounded-xl bg-gray-50 dark:bg-gray-800 py-2 text-center
       요일 text-[11px] font-semibold text-gray-600 dark:text-gray-300
       등급 필(위 표 색, mx-auto mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold)
       POP  mt-0.5 text-[10px] text-gray-400 dark:text-gray-500 ("강수 40%")
       best 셀: ring-1 ring-primary/40 + 요일 text-primary
CTA:   mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-3
       text-sm font-bold  (높이 ≈44px)
       good/fair: bg-primary text-white hover:bg-primary/90
       전부 bad:  border border-gray-200 bg-white text-gray-700 hover:bg-gray-50
                 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300  (위계 강등)
       레이블: "세차 되는 최저가 주유소 보기" + ChevronRightIcon h-4 w-4
면책:  mt-2 text-center text-[10px] text-gray-400 dark:text-gray-500
       "예보 기반 참고용 지수입니다 · 출처: 기상청"
       (dustGrade를 실제 사용한 주간에는 " · 에어코리아" 추가)
```

### 모바일·safe-area

- 카드는 문서 흐름(스크롤 영역)이라 safe-area 이슈 없음. BottomSheet(`pb-[calc(8px+env(safe-area-inset-bottom))]`)·상세 CTA는 기존 처리 유지.
- 터치 타깃: 세차 칩(행 44px), CTA(44px), 숨김 버튼(패딩 확장 44px), 빈 상태 "세차 필터 끄기"(py-2.5 이상 확보).
- 한 손 조작: 딥링크의 결과 확인 지점이 하단 시트(엄지 영역)라 흐름 종점이 자연스럽다.

### 접근성

- 세차 칩: `aria-pressed` + 텍스트 "세차"(아이콘 단독 금지).
- 등급: 색+텍스트 라벨 병기. 스트립 셀에 `aria-label="토요일 좋음, 강수확률 10%"`.
- CTA·숨김·탈출 버튼 전부 의미 있는 텍스트 레이블. 카드 루트는 `<section aria-label="세차하기 좋은 날">`.
- 배지: 장식 아이콘은 `aria-hidden`(icons 세트 기본값) — 텍스트 "세차"가 접근성 이름.

---

## 상태·엣지 케이스

| 상황 | 화면 |
|---|---|
| 카드 로딩 중 | 아무것도 렌더하지 않음(스켈레톤 없음 — ForecastCard 관례. 지도 아래 흐름이라 자리 이동 체감 없음) |
| 지수 데이터 없음(배치 미실행·API 실패·`days:[]`) | 카드 미렌더, 콘솔 오류 없음(AC-3). 세차 칩은 독립 동작 |
| Mock 모드(`NEXT_PUBLIC_USE_MOCK=true`) | mock 지수(토요일 good)로 카드 정상 렌더 · 세차 칩은 mock `hasCarwash` 필터로 동작 |
| 오늘 하루 숨김 후 | 당일 미렌더 → 익일(KST) 자동 재노출. localStorage 불가(프라이빗 모드)면 세션 한정 숨김(NoticePopup 관례) |
| 모든 날 bad | 제목 교체 + CTA 보조 스타일(흐름 C). 카드는 유지(정보 가치 있음) |
| D+3 미세먼지 등급 결측 | 스트립 POP만 표시, 근거 문구에서 해당일 미세먼지 언급 생략(공식이 결측 허용 — plan 미해결 #3) |
| 세차 칩 ON + 결과 0곳 | 시트 빈 상태 "이 지역엔 세차 가능으로 확인된 주유소가 아직 없어요 — 정보 수집 중" + "세차 필터 끄기" 버튼. 지도는 오류 없이 빈 마커(AC-4) |
| 세차 칩 ON + 내 주변 탭 0곳 | 같은 문구에 "반경 {radiusKm} 안에" 접두 변형 |
| 세차 칩 ON 중 EV 레이어 전환 | 칩 숨김·필터 비적용(EV 조회와 무관). gas 복귀 시 상태 유지된 채 재적용 — brands 관례와 동일 |
| 세차 칩 ON + 브랜드 필터 | AND 교집합(AC-3). 둘 다 활성 스타일로 동시 표시 |
| 카드 CTA 탭 시 이미 칩 ON | 멱등 — `setCarwashOnly(true)` 유지, 스크롤+시트 열기만 수행 |
| 위치 정보 없음(권한 거부·lastView 없음) | 서울 폴백, 헤더 "서울 기준" 표기로 근사임을 고지 |
| 오프라인 | 카드: fetch 실패 → 미렌더. 칩: 재조회 실패 시 기존 목록 유지(현행 fetch 실패 처리 관례) — 오류 토스트 신설하지 않음 |
| 상세: 미보강 vs 미보유 | "부가서비스 정보 확인 중입니다" vs "제공되는 부가서비스가 없습니다."(흐름 D, AC-5) |

---

## 미해결/리스크

1. **카드가 below-the-fold**: ForecastCard 동형 배치라 첫 화면(지도)에서는 보이지 않는다. 오버레이 간섭 제로(AC-6)와 맞바꾼 트레이드오프. 노출 실적(`carwash_card_click`)이 목표(일 5건) 미달이면 다음 사이클에서 지도 위 1줄 힌트 칩(예: 상단 배너 빈 슬롯 활용) 검토.
2. **BottomSheet 외부 열기(`openSignal`)**: 현재 open이 내부 상태라 CTA 딥링크(AC-2)에 prop 신설이 필요. `onOpenChange`와의 상태 동기화(부모 `sheetOpen` ↔ 내부 open)가 어긋나지 않게 구현 담당이 주의할 것.
3. **good=emerald와 마커 초록 혼동**: 카드 문맥 한정 + 라벨 병기로 완화했으나, 사용자가 "초록=싸다" 스키마를 카드에 투영할 가능성은 잔존. 혼동 신호(문의 등) 발생 시 good을 sky 계열로 교체하는 B안을 예비.
4. **소형 화면(≤340px)에서 4열 스트립**: 셀 내부가 요일+필+POP 3줄이라 320px 뷰포트에서 등급 필 텍스트("좋음")가 px-1.5 기준 빠듯할 수 있음 — 구현 시 320px에서 확인, 넘치면 셀 `px-0.5` + 필 `px-1`로 축소.
5. **행 배지 과밀**: 전국N위 + 세차 배지 + 긴 주유소명이 동시에 오면 이름 truncate가 심해진다. 발생 빈도(전국 TOP10 ∩ 세차)가 낮아 v1은 수용. 문제 시 세차 배지를 2행 메타 텍스트("· 세차")로 강등하는 B안.
6. **has_carwash 커버리지**(plan 미해결 #1): 보강률 30% 미만이면 칩 결과가 과소해 빈 상태가 자주 노출된다. 빈 상태 문구("정보 수집 중")로 1차 방어했고, 칩 옆 툴팁 추가 여부는 구현 단계에서 실측 후 결정.
7. **근거 한 줄의 날짜별 가변성**(plan 미해결 #3): D+3 미세먼지 결측으로 문구 조합이 날마다 달라진다 — 본 명세의 생성 규칙(우선순위: best POP → 감점 요인 1개)으로 고정했으나, 문장 자연스러움은 구현 후 실데이터로 검수 필요.
8. **plan의 TanStack Query 언급**: 코드베이스 미도입 상태(ForecastCard 주석 명시) — 본 명세는 기존 `useEffect+fetch` 패턴을 지정했다. 구현 담당은 의존성 추가 없이 진행할 것.
9. **FR-2는 UI 무관**이나, 조회 API 응답 필드(`regionName`, `popMax`, `dustGrade`, `best`)가 카드 표시 요구를 전부 충족해야 한다 — API 설계 시 본 명세의 스트립·근거 문구 요구를 계약으로 삼을 것.
