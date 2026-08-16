# 기획서: 세차 묶음 — 세차 가능 주유소 필터 + "세차하기 좋은 날" 지수

> 담당: 기획(PM). 근거: 같은 폴더 `research.md`(2026-08-16 신규 기능 발굴, 후보 C2 채택).
> 구현 전 반드시 "미해결/리스크" §의 커버리지 실측 항목을 확인할 것.

---

## 배경·목표

- **조사 근거** (`research.md`):
  - §4 C2: 세차라는 새 방문 목적을 여는 저비용·고차별 후보. `stations.has_carwash`가 이미 DB에 있고(0001+0010), 날씨 예보만 결합하면 됨. 국내 주유 앱 중 "세차하기 좋은 날" 결합 사례 없음.
  - §3-4: "세차하기 좋은 날(날씨·미세먼지·강수)"는 독립 앱·콘텐츠가 존재할 만큼 반복 니즈.
  - §1.2: 재료 자산 — `has_carwash`(0010 회전 보강), 칩 필터 패턴(`components/ui/FilterBar.tsx` + `stores/map.ts`의 brands 패턴), data.go.kr 연동 패턴(`lib/ev/client.ts`), 일 1회 배치 패턴(`app/api/internal/sync-market/route.ts` + `0025_market_data.sql`), 계측(`0033_funnel_events.sql`, `lib/analytics.ts`).
  - §1.3: Opinet 일 ~1,500콜 한도 — 주유소 단건 실시간 detail 호출 추가 금지, 기존 sync 데이터만 사용.
- **코드 현황 실측** (기획 시점 확인):
  - 세차 정보는 상세 페이지 배지로만 노출 중(`app/station/[id]/page.tsx:163` AmenityList). 지도 필터·목록 배지는 없음.
  - bbox/radius RPC 응답(`lib/db/queries.ts:12~16` RpcRow)에 `has_carwash`가 **없음** → 목록 배지·필터 모두 RPC 변경이 필요.
  - research.md §1.1의 "FilterBar에 selfOnly 있음" 서술과 달리, **현 작업 트리에는 selfOnly 칩이 없다**(grep 확인 — `stores/map.ts`·`FilterBar.tsx`에 부재, 2026-08-15 사이클 문서에만 존재). 따라서 재사용할 실제 패턴은 `stores/map.ts:126~129`의 `brands`/`toggleBrand` 토글 패턴이다.
- **이번 사이클이 끝나면 사용자가 얻는 것**: 지도에서 "세차" 칩 한 번으로 세차 되는 주유소만 골라 보고, 홈에서 "이번 주 세차하기 좋은 날"을 확인한 뒤 그날 세차 되는 최저가 주유소로 바로 이동할 수 있다.

## 유저 스토리

1. 주말에 세차하려는 운전자로서, 주유하는 김에 세차까지 되는 주유소만 지도에서 보고 싶다. 그래서 세차장 찾아 따로 검색하지 않고 기름값 비교와 세차를 한 번에 해결한다.
2. 세차 타이밍을 고민하는 운전자로서, 며칠 내 비·미세먼지 예보를 반영한 "세차하기 좋은 날"을 홈에서 한눈에 보고 싶다. 그래서 세차한 다음 날 비를 맞는 헛수고를 피한다.
3. 세차하기 좋은 날을 확인한 운전자로서, 그 자리에서 세차 되는 최저가 주유소로 바로 이동하고 싶다. 그래서 정보 확인→방문 결정이 한 흐름으로 이어진다.

---

## 기능 요구사항

### FR-1: 지도 "세차" 필터 칩 + 목록·상세 세차 배지

- **설명**: FilterBar에 "세차" 토글 칩을 추가하고, 켜면 bbox/radius 조회가 `stations.has_carwash = true`인 주유소만 반환한다(서버측 조건). 하단 시트 목록 행에는 세차 배지를 표시한다.
  - **서버측 필터인 이유**: bbox RPC는 "가격 낮은 순 TOP N"을 잘라 반환한다. 클라이언트 후필터로 하면 TOP N에 든 세차 주유소만 남아, 커버리지가 낮은 현 상황에서 결과가 과소해진다. RPC 조건이면 limit이 세차 주유소로 채워져 "세차 되는 곳 중 최저가 TOP N"이라는 올바른 의미가 된다.
  - **"데이터 없음"과 "세차 없음" 구분(v1 결정)**: 지도·목록은 `has_carwash=true`만 표시하고 구분하지 않는다(배지는 확정 정보만). 대신 상세 페이지에서 `amenities_updated_at`(이미 detail select에 포함 — `lib/db/queries.ts:422`)이 null이면 AmenityList의 "제공되는 부가서비스가 없습니다." 문구를 "부가서비스 정보 확인 중입니다"로 바꿔 미보강과 미보유를 구분한다.
- **구현 위치**:
  - `supabase/migrations/0036_carwash_filter.sql` — 신규(스키마 초안은 아래 "신규 DB" 참조): `rpc_stations_by_bbox` / `rpc_stations_by_radius` / `rpc_stations_by_bbox_brand`에 `p_carwash boolean default false` 파라미터 추가 + 반환 컬�럼에 `has_carwash` 추가. ※ 파라미터 추가는 `create or replace` 불가(시그니처 변경) → `drop function` 후 재생성.
  - `lib/db/queries.ts` — `queryStationsByBbox`/`queryStationsByRadius`에 `carwash?: boolean` 인자, RpcRow에 `has_carwash`, mock 폴백은 `getMockStations(...).filter(s => !carwash || s.hasCarwash)`(mock 데이터에 `hasCarwash` 이미 존재 — `lib/mock/stations.ts`).
  - `app/api/stations/bbox/route.ts`, `app/api/stations/radius/route.ts` — `carwash=1` 쿼리 파라미터 수용. **Redis 캐시 키에 carwash 차원 포함**(캐시 오염 방지).
  - `stores/map.ts` — `carwashOnly: boolean` + `toggleCarwashOnly`(brands 패턴과 동형, 세션 유지 불필요).
  - `components/ui/FilterBar.tsx` — EV 칩 뒤에 "세차" 칩(gas 레이어에서만 노출, `aria-pressed`). 켜면 bbox/radius 재조회(`app/page.tsx:329,479` fetch 파라미터에 결합).
  - `components/map/BottomSheet.tsx`(목록 행) — `hasCarwash` true일 때 세차 배지(상세 AmenityList 배지와 동일 톤).
  - 회색 점(`/api/stations/all-in-bbox`, `rpc_stations_in_bbox`): 세차 칩 ON일 때는 회색 점 레이어를 **숨긴다**(표시 집합 일관성 확보 — RPC 4개째 변경 대신 저비용 선택. `app/page.tsx:568` visibleAllStations에서 `carwashOnly ? [] : ...`).
- **수용 기준(AC)**:
  1. gas 레이어 FilterBar에 "세차" 칩이 보이고, EV 레이어에서는 보이지 않는다. 탭하면 활성 스타일(기존 칩과 동일), 재탭하면 해제된다.
  2. 세차 칩 ON 상태에서 지도 마커·하단 시트 목록에 세차 가능 주유소만 표시되고, 각 행에 세차 배지가 보인다(Mock 모드: `lib/mock/stations.ts`의 `hasCarwash: true` 주유소만 남는 것으로 검증 가능).
  3. 세차 칩 ON + 브랜드 필터를 함께 켜면 AND 교집합만 표시된다.
  4. 세차 칩 ON인데 화면 영역에 결과가 0곳이면 하단 시트에 빈 상태 안내("이 지역엔 세차 가능으로 확인된 주유소가 아직 없어요 — 정보 수집 중")가 표시되고, 지도·앱이 오류 없이 동작한다.
  5. 상세 페이지: 부가서비스가 한 번도 수집되지 않은 주유소(`amenities_updated_at` null)는 "부가서비스 정보 확인 중입니다"가, 수집됐지만 전부 미보유면 기존 "제공되는 부가서비스가 없습니다."가 표시된다.
  6. 세차 칩을 켜면 `track('carwash_filter_on')` 이벤트가 1회 전송된다(`lib/analytics.ts` 재사용, Network 탭 `/api/event`로 확인).

### FR-2: "세차 지수" 데이터 파이프라인 (기상청 예보 배치 + 조회 API)

- **설명**: 기상청 단기예보(공공데이터포털, 무료)의 강수확률(POP)과 에어코리아 미세먼지 예보 등급(선택 입력)으로 시도별 "세차 지수"를 1일 1회 산출·적재하고, 좌표 기반 조회 API를 제공한다.
  - **지역 범위(v1 확정 — research §7 미해결 #3에 대한 결정)**: **시도 17개 대표점 고정**. 격자 변환(Lambert 투영)을 런타임에 구현하지 않고, 17개 시도 대표점의 기상청 격자좌표(nx, ny)를 **사전 계산 상수**로 `lib/weather/kma.ts`에 하드코딩한다(`lib/ev/client.ts`의 EV_ZCODES 상수 패턴과 동형). 시군구 정밀화는 Out.
  - **조회 지역 판정**: API가 `lat/lng`를 받아 17개 대표점 중 **최근접 대표점의 시도**를 반환한다(행정경계 판정·역지오코딩 없음 — 근사임을 인지하고 카드에 "○○ 기준" 라벨 표시로 보완).
  - **지수 공식(v1 초안 — 근사·참고용)**: 대상일 d(오늘~D+3, 4일 창)에 대해
    - `score(d) = 100 − max(당일 최대 POP, 익일 최대 POP)` — 세차 다음 날 비가 오면 감점되도록 익일 POP 반영.
    - 해당일 미세먼지 예보 등급이 '나쁨' 이상이면 −20 (등급 결측이면 감점 없음 — 미세먼지 API 실패가 지수 산출을 막지 않음).
    - 등급: `good`(≥70) / `fair`(40~69) / `bad`(<40). 0 미만은 0으로 클램프.
    - 임계값·공식은 근사치이며 UI에 면책 문구를 붙인다(FR-3 AC 5). 기상 단정 표현("비 옵니다") 금지 — "강수확률 70%" 등 확률 표현만.
  - **호출량**: 단기예보 17콜 + 미세먼지 예보 1콜 = **일 ~18콜** (기상청 단기예보 개발계정 일 한도 통상 10,000콜 — 활용신청·실한도는 운영 확인 항목, 미해결 §참조). Opinet 호출은 0건 추가.
  - **Mock 폴백(SRS §9)**: `NEXT_PUBLIC_USE_MOCK=true` 또는 API 키 미설정 시 조회 API가 고정 mock 지수(예: 토요일 good)를 반환해 키 없이 로컬 동작한다.
- **구현 위치**:
  - `supabase/migrations/0037_carwash_index.sql` — `carwash_index` 테이블(스키마 초안은 "신규 DB" 참조).
  - `lib/weather/kma.ts` — 기상청 단기예보 클라이언트(서버 전용 키 `KMA_API_KEY`, `NEXT_PUBLIC_` 금지 — SEC-1 준용) + 시도 대표점 (nx, ny) 상수 + 에어코리아 예보 파서. `lib/ev/client.ts`의 data.go.kr 응답 정규화 패턴 재사용.
  - `app/api/internal/sync-weather/route.ts` — 1일 1회 크론(CRON_SECRET Bearer — SEC-2), 17개 시도 지수 산출 → `carwash_index` upsert(멱등, `0025` sync-market 패턴). 시도별 부분 실패 시 성공분만 적재하고 5xx가 아닌 부분 성공 응답.
  - `app/api/carwash-index/route.ts` — `GET ?lat=&lng=` 공개 조회(rate limit — SEC-3 준용), 응답 `{ region, regionName, days: [{date, score, grade, popMax, dustGrade}], best }`. 데이터가 오늘자 미존재면 `days: []`.
- **수용 기준(AC)**:
  1. `POST /api/internal/sync-weather`를 올바른 `CRON_SECRET`으로 호출하면 17개 시도 × 4일치가 `carwash_index`에 upsert되고, 재실행해도 중복 없이 갱신된다(멱등). 시크릿 없이 호출하면 401.
  2. `GET /api/carwash-index?lat=37.56&lng=126.97`이 서울 기준 4일치 지수(`score` 0~100, `grade`)와 `best`(최고 점수 날)를 1초 내 반환한다. 좌표 결측·비정상이면 서울 폴백 또는 400(설계 시 확정).
  3. Mock 모드에서 외부 키 없이 mock 지수가 반환되고 홈 카드(FR-3)가 렌더된다.
  4. 미세먼지 API만 실패해도 강수확률 기반 지수는 정상 적재된다(dustGrade null).
  5. `KMA_API_KEY`가 클라이언트 번들에 노출되지 않는다(`NEXT_PUBLIC_` 금지, 서버 라우트에서만 참조).

### FR-3: 홈 "세차하기 좋은 날" 미니 카드 + 세차 최저가 딥링크

- **설명**: 홈(지도) gas 레이어에 미니 카드를 노출한다 — "이번 주 세차하기 좋은 날: 토요일" + 근거 한 줄(예: "일요일 강수확률 70%") + CTA "세차 되는 최저가 주유소 보기". CTA를 탭하면 **세차 칩이 켜지고**(FR-1의 `carwashOnly=true`) 하단 시트가 열려 현재 화면/내 주변의 세차 최저가 목록이 보인다. `ForecastCard` 노출 패턴(`app/page.tsx:1113` — gas 레이어 한정, 데이터 없으면 스스로 미표시)과 동형.
  - 모든 날이 `bad`면 "이번 주는 세차를 미루는 게 좋겠어요"로 표기(딥링크 CTA는 유지).
  - 지수 데이터가 없으면(배치 미실행·실패) 카드 자체를 렌더하지 않는다(graceful) — **세차 지수 카드는 has_carwash 커버리지와 무관하게 동작**하고, 역으로 세차 필터도 카드 없이 독립 동작한다.
  - 카드 접기(dismiss): 당일 localStorage 플래그로 "오늘 하루 숨김"(기존 공지 팝업 패턴 준용). 화면 점유 리스크 완화.
- **구현 위치**:
  - `components/carwash/CarwashDayCard.tsx` — 신규(내부에서 `/api/carwash-index` 조회, TanStack Query. 위치는 `useGeolocation` 좌표 있으면 사용, 없으면 지도 중심 `lastView`, 그것도 없으면 서울 — 좌표를 서버로 보내는 일회성 조회이며 저장하지 않음: LBS 고지 프레임 유지).
  - `app/page.tsx` — `{layer === 'gas' && <CarwashDayCard />}` 배치(ForecastCard 인접, 겹침 없는 위치는 디자인 단계 확정).
  - `stores/map.ts` — CTA가 `carwashOnly` 세팅(FR-1 재사용).
  - 계측: 카드 CTA 탭 시 `track('carwash_card_click', { bestDay, grade })`(`lib/analytics.ts`).
- **수용 기준(AC)**:
  1. gas 레이어 홈에서 지수 데이터가 있으면 카드가 표시되고, "가장 좋은 날의 요일 + 등급"과 근거 한 줄(강수확률 % 또는 미세먼지 등급)이 보인다. EV 레이어에서는 보이지 않는다.
  2. CTA 탭 시 1초 내 세차 칩이 활성화되고 하단 시트에 세차 가능 주유소 목록(가격 오름차순)이 표시된다. 이때 `carwash_card_click` 이벤트가 전송된다.
  3. 지수 데이터가 없으면 카드가 렌더되지 않고 콘솔 오류가 없다.
  4. "오늘 하루 숨김"을 누르면 당일 재방문 시 카드가 보이지 않고, 다음 날(KST) 다시 보인다.
  5. 카드(또는 카드의 정보 영역)에 "예보 기반 참고용 지수입니다 · 출처: 기상청" 면책·출처 문구가 표시되고, "비가 온다/안 온다" 식 단정 표현이 없다(확률·등급 표현만).
  6. 모바일 뷰포트(iOS Safari/Android Chrome)에서 카드가 지도 조작·기존 배너(RadiusAlert, ForecastCard)와 겹쳐 가려지지 않는다. 다크모드 정상.

---

## 범위

### 포함(In)
- FR-1 세차 필터 칩 + 목록 배지 + RPC `p_carwash` 조건(마이그레이션 0036) + 상세 "정보 확인 중" 문구.
- FR-2 기상청·에어코리아 배치(`sync-weather`) + `carwash_index` 테이블(0037) + 조회 API + mock 폴백.
- FR-3 홈 미니 카드 + 세차 칩 딥링크 + 계측 이벤트 2종(`carwash_filter_on`, `carwash_card_click`).

### 제외(Out) — 다음 사이클로 미룸
- **X(트위터) 자동발행 연동**: 세차 지수는 기존 `post-daily-tweet` 파이프라인의 좋은 공유 소재지만(research §4 C2 "트윗 소재"), 이번엔 지수 데이터 신뢰도(배치 안정 가동)를 먼저 확보한다. 지수가 1~2주 안정 적재된 뒤 별도 사이클로.
- **시군구 격자 정밀화 / 현위치 정밀 격자 변환**: v1은 시도 대표점 근사로 충분(카드에 "○○ 기준" 표기로 보완). 사용률 확인 후 확장.
- **세차 예약·세차장 요금/기계식 여부 정보**: 데이터 소스 없음.
- **회색 점(rpc_stations_in_bbox) 세차 필터 서버 반영**: v1은 칩 ON 시 회색 점 숨김으로 갈음(FR-1). 필요성 확인 후 확장.
- **검색(/api/search)·경로(route-cheapest) 결과의 세차 필터**: 지도 필터 사용률을 본 뒤 확장.
- **세차 지수 푸시 알림**: 카드 노출·클릭 실적 확인 후 검토(FR 3개 상한 준수).
- **중기예보(D+4~10) 결합**: 단기예보 4일 창으로 시작.

---

## 성공 지표 (사이클 후 funnel_events로 확인)

| 지표 | 이벤트/소스 | 목표(가설) |
|---|---|---|
| 세차 칩 사용률 | `carwash_filter_on` 고유 디바이스 / 일 방문 디바이스(`funnel_counts` RPC 재사용) | 주간 방문 디바이스의 5% 이상 |
| 세차 카드 클릭 | `carwash_card_click` 건수 및 고유 디바이스 | 카드 노출일 기준 일 5건 이상 |
| 카드→상세 연결 | `carwash_card_click` 발생 디바이스의 동일일 주유소 상세 진입(page_visits/funnel join) | 클릭의 30% 이상 |
| 배치 안정성 | `sync-weather` 크론 성공률(오늘자 `carwash_index` 행 존재 여부) | 7일 연속 무결손 |
| (향후) X 공유 시너지 | 지수 안정화 후 자동발행 소재로 활용 — 이번 범위 밖, 트래픽 유입 가설만 기록 | — |

## SRS 반영 제안 (제안만 — 직접 수정 금지)

- **§3.1 FR-1.3**: "유종 + 브랜드 + 셀프 필터"에 **세차 필터** 추가. (참고: 현행 SRS의 "셀프 필터" 서술도 현 코드와 불일치 — 2026-08-15 사이클 산출물의 반영 여부 확인 필요.)
- **§3 신규 절(예: 3.9 세차 지수)**: FR-2/FR-3 요약과 데이터 출처(기상청 단기예보·에어코리아), 1일 1회 갱신 주기, 근사·참고용 고지 원칙.
- **§4 데이터 모델**: `carwash_index` 테이블 추가.
- **§5 API 계약**: `GET /api/carwash-index`(공개, rate limit), `POST /api/internal/sync-weather`(CRON_SECRET) 2행 추가.
- **§7 보안**: SEC-1에 `KMA_API_KEY`(및 에어코리아 키) 서버 전용 명시.
- **§8 법적/운영**: 기상청·한국환경공단(에어코리아) 출처 표기 의무 추가(공공데이터 이용조건).

## 신규 DB (마이그레이션 초안)

현재 최신 마이그레이션은 `0035_visit_regions.sql` → 이번 사이클은 **0036, 0037** 사용.

### `supabase/migrations/0036_carwash_filter.sql`
- `rpc_stations_by_bbox` / `rpc_stations_by_radius` / `rpc_stations_by_bbox_brand` 3개 함수에:
  - 파라미터 `p_carwash boolean default false` 추가 — true면 `and s.has_carwash` 조건.
  - 반환 컬럼에 `has_carwash boolean` 추가(목록 배지용).
- **주의**: 파라미터/반환형 변경은 `create or replace` 불가 → `drop function if exists ...(기존 시그니처)` 후 재생성. 오버로드 잔존 시 PostgREST 호출 모호성(ambiguity) 오류가 나므로 구 시그니처를 반드시 drop. 배포 순서는 마이그레이션 선적용 → 앱 배포(신규 파라미터는 default가 있어 구 앱 호출과 호환).

### `supabase/migrations/0037_carwash_index.sql`
```sql
-- 세차 지수(시도×일자) — /api/internal/sync-weather 가 1일 1회 적재.
-- 출처: 기상청 단기예보(강수확률 POP), 에어코리아 미세먼지 예보(등급, 결측 허용).
-- 근사·참고용 지수 — 산출식은 lib/weather/kma.ts 참조.
create table if not exists carwash_index (
  date        date not null,            -- 대상일(KST)
  region      text not null,            -- 시도 코드(stations.sido_code 체계 '01'.. 와 동일)
  score       int  not null,            -- 0~100
  grade       text not null,            -- 'good' | 'fair' | 'bad'
  pop_max     int,                      -- 당일 최대 강수확률(%)
  pop_next    int,                      -- 익일 최대 강수확률(%) — 감점 근거 표기용
  dust_grade  text,                     -- 미세먼지 예보 등급(좋음/보통/나쁨/매우나쁨, null=결측)
  updated_at  timestamptz not null default now(),
  primary key (date, region)
);
create index if not exists carwash_index_region_date_idx
  on carwash_index (region, date desc);
alter table carwash_index disable row level security;  -- 서버(service_role) 전용
```

## 미해결/리스크

1. **[구현 착수 전 확인] has_carwash 커버리지 실측** (research §7 미해결 #2): 운영 DB에서 `select count(*) filter (where amenities_updated_at is not null) as backfilled, count(*) filter (where has_carwash) as carwash, count(*) as total from stations;` 실행. 보강률이 낮아도 FR-1은 무해하게 설계했으나(빈 상태 안내 AC-4, 배지는 true만), **보강률 30% 미만이면 칩 라벨 옆 "정보 수집 중" 툴팁 추가를 구현 단계에서 검토**. 세차 지수 카드(FR-2/3)는 커버리지와 무관하게 동작.
2. **기상청 API 활용신청·일 한도**: 공공데이터포털 "기상청_단기예보 조회서비스" 활용신청 필요(승인 즉시~수시간). 일 한도(개발계정 통상 10,000콜)로 일 ~18콜은 여유이나, **운영 배포 전 실제 승인 한도 확인**을 운영 체크리스트에 넣는다. 에어코리아 예보 API는 EvCharger와 같은 기관 코드(B552584)지만 **별도 활용신청** 필요 여부 확인.
3. **에어코리아 미세먼지 예보의 제공 범위**: 예보는 통상 당일~모레까지만 등급 제공 → D+3은 강수확률만으로 산출됨(공식이 이미 결측 허용). 카드 근거 문구가 날짜별로 달라질 수 있음을 디자인 단계에서 처리.
4. **지수 정확도 면책**: 예보 빗나감(세차했는데 비)에 대한 클레임 리스크 → FR-3 AC-5의 면책·출처 문구 필수, 단정 표현 금지. 공식 임계값(POP, −20 감점)은 v1 근사치로 두고 사용 데이터로 조정.
5. **RPC 시그니처 변경 배포 순단**: drop→create 사이 아주 짧은 함수 부재 구간 발생 가능 → 단일 트랜잭션 마이그레이션으로 최소화(Supabase migration은 기본 트랜잭션). 구현 담당 확인 사항.
6. **시도 대표점 근사 한계**: 도 경계 인근 사용자는 이웃 시도 지수가 나올 수 있음(최근접 대표점 방식) → "○○ 기준" 라벨로 고지. 정밀화는 Out(다음 사이클 후보).
7. **selfOnly 선례 확인**: 2026-08-15 사이클 문서에는 셀프 칩 구현 완료로 기록돼 있으나 현 트리에 코드가 없음(리버트 추정). 세차 칩 구현 시 **그 문서의 설계는 참고하되 현 코드(brands 패턴) 기준으로 구현**할 것. 리버트 사유(있다면)를 구현 담당이 git log로 확인해 같은 함정을 피할 것.
