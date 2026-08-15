# 조사 보고: 유종(연료 종류) 전면 반영 클러스터

- 작성일: 2026-08-15 (researcher)
- 주제 확정 경로: 백로그 재평가에서 `검색 결과 유종 반영` + `상세 가격추이 유종 탭` + `셀프 필터 칩`(BACKLOG.md 2026-08-14 3건)을 하나의 "유종 일관성" 클러스터로 묶어 추천 → 이번 사이클 주제로 확정.
- 용도: product-planner의 plan.md 입력 문서. **확정 범위는 FR-1/2/3 (아래 §4) — 이 틀을 유지한다.**

---

## 1. 현재 상태 (코드·문서 근거)

### 1.1 지도(홈)는 유종을 완전 지원 — 기준선(패턴 원본)

- 유종 상태는 `stores/map.ts:115~120`의 `product: ProductCode` + `setProduct` + `initProductFromVehicle`(차량 기본 유종 자동 선택, 사용자 직접 변경이 우선). 기본값 `'B027'`(`stores/map.ts:156`).
- `components/ui/FilterBar.tsx:11~13`: 칩 구성 = 휘발유 드롭다운(`GASOLINE_OPTIONS: ['B027','B034']`) + 단독 칩(`SIMPLE_PRODUCTS: ['D047','C004']`) + EV 칩. **K015(등유) 칩과 셀프 칩은 없음** → SRS FR-1.3("유종 필터(휘발유/고급/경유/LPG/등유) + 브랜드 + 셀프 필터")과 괴리.
- `app/page.tsx`는 유종 변경 시 bbox 재조회(`:264~273` effect, `[product, brands]` deps), TOP10 재조회(`:287~306`), 요청 시 `productRef`로 최신 유종 보장 + out-of-order 응답 무시(`:314`, `:337`) 등 유종 경쟁 방어까지 갖춤.
- 서버: `/api/stations/bbox`(`app/api/stations/bbox/route.ts:25` `product` 파라미터), `/api/stations/radius`(`app/api/stations/radius/route.ts:13`), `/api/stations/top10` 모두 product를 받아 유종별 RPC 조회 + 유종 포함 캐시 키(`keys.bbox(zoom, product, …)`, `keys.radius(product, …)`).

### 1.2 검색은 B027(휘발유) 하드코딩 — FR-1 대상

`app/api/search/route.ts` 전문 요지:

- `:6` `export const revalidate = 60;`
- `:17` mock 분기 `getMockStations('B027')` 고정.
- `:32~38` Supabase 쿼리(정확 인용):
  ```ts
  const { data, error } = await sb
    .from('stations')
    .select('id, name, brand_code, address, lat, lng, is_self, prices_latest!inner(product, price)')
    .or(`name.ilike.${like},address.ilike.${like}`)
    .eq('prices_latest.product', 'B027')
    .order('name')
    .limit(limit);
  ```
- `:44~46` 응답 매핑: `isSelf: row.is_self`, `price: prices_latest[0].price`, `product: 'B027'` 고정.

클라이언트 `app/search/page.tsx`:
- `:27` `fetch('/api/search?q=…')` — **product 미전달**. `useMapStore`도 import하지 않음(홈에서 경유를 보다 검색으로 넘어가면 휘발유 가격이 나옴).
- `:9~12` `Result` 인터페이스에 `isSelf: boolean`이 이미 있으나 **렌더에서 미사용**(`:59~82` 목록 렌더는 브랜드 점·이름·주소·가격만). `product` 필드는 인터페이스에 없음.

### 1.3 상세 페이지는 추이·주유기록 단가가 B027 고정 — FR-2 대상

`app/station/[id]/page.tsx`:
- `:19` `export const dynamic = 'force-dynamic';` — **async 서버 컴포넌트**(`'use client'` 없음, `:23` `export default async function`).
- `:21` `PRODUCT_ORDER: ['B027','B034','D047','K015','C004']` — 유종별 현재가 리스트(`:85~102`)는 **전 유종을 이미 표시**(없으면 "정보 없음").
- `:110~113` 가격 추이 섹션: 제목 하드코딩 `"휘발유 30일 추이"` + `<PriceHistoryChart stationId={detail.id} product="B027" />`.
- `:134` 주유기록 버튼: `<FuelLogButton stationId={detail.id} unitPrice={detail.prices.B027?.price ?? null} />` — 경유/LPG 차량 사용자에게 휘발유 단가가 리터↔금액 추정 기준으로 쓰임(`components/station/FuelLogButton.tsx:19~20` — `unitPrice`는 "휘발유 현재가" 주석까지 있음).
- 차트 `components/charts/PriceHistoryChart.tsx`: `'use client'`, props가 이미 `{ stationId, product: ProductCode }`(`:10`)이고 `useEffect` deps `[stationId, product]`(`:25`)라 **product가 바뀌면 자동 재조회**.
- 이력 API `app/api/stations/[id]/history/route.ts`: `product` 쿼리 파라미터 이미 지원(`?? 'B027'` 기본), `rpc_price_history_daily(p_product)` 호출. `revalidate = 1800`.

### 1.4 셀프 필터 — FR-3 대상

- 데이터: bbox/radius 응답의 각 주유소에 `isSelf` **실재 확인**. `lib/db/queries.ts:12~16` `RpcRow.is_self` → `:49`(bbox 매핑) / `:108`(radius 매핑) `isSelf: r.is_self`. 회색 점(`StationPoint`)도 `isSelf` 포함(`queries.ts:85`, `types/station.ts:104`).
- 클라이언트 필터 패턴(브랜드) — `app/page.tsx:527~564`(정확 인용):
  ```ts
  const brandSet = useMemo(() => new Set(brands), [brands]);
  const matchBrand = useMemo(
    () => (b: string) => brandSet.size === 0 || brandSet.has(b as never),
    [brandSet],
  );
  const visibleStations = useMemo(
    () => (brandSet.size === 0 ? stations : stations.filter((s) => matchBrand(s.brand))),
    [stations, brandSet, matchBrand],
  );
  // …visibleNationalTop10(:538), visibleNearbyTop10(:542), visibleNearbyStations(:556), visibleAllStations(:561) 동일 패턴
  ```
  → `selfOnly`를 **같은 자리**(각 `visible*` useMemo에 `.filter((s) => !selfOnly || s.isSelf)` 결합)에 끼울 수 있는 구조 확인.
- 스토어: `stores/map.ts:122~129`에 브랜드 배열 + toggle이 있으므로 `selfOnly: boolean` + `toggleSelfOnly`를 동형으로 추가하면 됨.

### 1.5 유종 코드→라벨 매핑(공용 상수)

- **단일 공용 상수 존재**: `types/station.ts:5~11` `PRODUCT_LABEL` — `{ B027: '휘발유', B034: '고급휘발유', D047: '경유', K015: '실내등유', C004: 'LPG' }`. 전 코드베이스(상세/route/regions/sync/queries 등 20+ 파일)가 이걸 import — 중복 정의 없음(`app/admin/forecast/page.tsx:24~30`의 `FUEL_LABEL`도 PRODUCT_LABEL 재사용 래퍼).
- 표기 불일치: SRS `docs/요구사항_명세서.md` §1.3은 K015를 "**등유**"로, 코드는 "**실내등유**"로 표기. 오피넷 공식 제품명이 '실내등유'라 코드 쪽이 원천 데이터에 충실. K015는 이번 범위 제외이므로 UI 영향 없음 — 문서 표기만 통일 여지.

### 1.6 K015(등유) 데이터 현실 — 범위 제외의 타당성 근거

- `app/api/internal/sync-opinet/route.ts:21~24`: `// 취급 4종 — 휘발유/경유/고급휘발유/LPG. (실내등유 K015 제외)` → `const PRODUCTS: ProductCode[] = ['B027', 'D047', 'B034', 'C004'];` — **동기화 자체가 K015를 적재하지 않음**. `prices_history` insert(`:283~284`)도 이 루프 산물이므로 K015 이력 없음.
- 따라서 상세의 `detail.prices.K015`는 사실상 항상 null(예외: 가격 전무 주유소 진입 시 Opinet detailById 폴백이 K015를 채울 수 있으나 Redis에만 캐시, DB 미적재 — `lib/db/queries.ts:497~537`, `lib/opinet/client.ts:112~117`). K015 칩/탭을 지금 넣으면 "빈 지도/빈 차트"가 되므로 **백로그 유지가 맞음**.

### 1.7 최근 방향(커밋)

- `git log`: 유종 전환 경쟁 방어(top10 no-store, out-of-order 무시)가 이미 정비됨(app/page.tsx 주석 `:278~286`). 데이터 캐시로 인한 stale 버그를 `getSupabaseFresh`(no-store 강제)로 잡은 전례: 커밋 `15c5828`, `4cc93f5` + `lib/db/supabase.ts:25~29` 주석.

---

## 2. 문제/기회 (사용자 관점)

경유(국내 등록차 중 최다급)·LPG·고급휘발유 차량 운전자에게 서비스가 "반쪽"으로 동작:

1. **검색이 휘발유 전용**: 홈에서 경유를 선택해도 검색 결과 가격은 휘발유. 더 심각하게는 `prices_latest!inner` + `eq(product,'B027')` 때문에 **B027 가격 행이 없는 주유소(LPG 전용 충전소, 경유만 파는 곳)는 이름으로 검색해도 아예 안 나옴** — 존재하는 업소가 "검색 결과 없음"이 되는 결함(sync는 C004를 시군구×유종으로 적재하므로 LPG 전용 충전소가 stations/prices_latest에 실재).
2. **상세 추이가 휘발유 고정**: LPG 차량 사용자가 충전소 상세에서 보는 30일 차트가 자기 연료가 아님. 주유기록의 리터↔금액 추정 단가도 휘발유 기준이라 계산이 틀어짐.
3. **셀프 필터 부재**: SRS FR-1.3에 명시된 기능인데 미구현. 셀프가 통상 더 저렴해 "최저가 찾기" 코어 가치와 직결. 데이터(isSelf)는 이미 모든 응답에 실려 옴 — 순수 UI/스토어 작업만 남음.

## 3. 외부 사례·동향

- **오피넷(공식 앱/웹)**: 유종 선택(휘발유·고급·경유·등유·LPG)이 모든 검색 화면(내주변/지역/경로)의 1급 파라미터이고 **셀프·알뜰 필터를 기본 제공**. 우리 서비스가 따라잡아야 할 최소선. (opinet.co.kr searRgSelect, 앱 가이드 다수)
- **티맵/카카오내비**: 주유 가격 표시가 차량 유종 설정을 따름 — "내 차 연료 기준 일관 표시"가 업계 표준 UX. 우리도 `initProductFromVehicle`(stores/map.ts:120)로 지도에는 이미 구현했으나 검색/상세가 끊겨 있음.
- **LPG 사용자 니즈**: 충전소가 희소해(나무위키 LPG 충전소 문서) "이름/지역으로 충전소 검색"의 가치가 휘발유보다 오히려 큼 — 현재 검색에서 LPG 전용 충전소가 통째로 누락되는 것은 이 세그먼트에 치명적.

## 4. 개선 방향 (확정 FR 3개 — 구현 관점 정리)

### FR-1. 검색 유종 반영 (기대 효과: 비휘발유 사용자 검색 정상화 + 누락 업소 복구 / 비용: 소~중)
- `app/api/search/route.ts`: `product` 쿼리 파라미터 추가(화이트리스트 검증 — `in PRODUCT_LABEL` 패턴이 관례, 예 `lib/auth/session.ts:92`). mock 분기도 `getMockStations(product)`로.
- **inner join 수정 방향(택1, 근거 §1.2)**:
  - (권장) left join화: `prices_latest!inner(...)` → `prices_latest(product, price)`로 바꾸고 `.eq('prices_latest.product', product)`는 임베드 필터로 유지(PostgREST에서 임베드 필터는 부모 행을 걸러내지 않음 — inner가 아닐 때). 해당 유종 가격 없으면 `price: null`로 응답 → 업소는 항상 검색됨, 가격만 "정보 없음". 이름 검색의 기대(업소 발견)와 부합.
  - (대안) product 동적화만: `!inner` 유지 + `.eq(..., product)`. LPG 선택 시 LPG 충전소는 나오지만, "휘발유 모드에서 LPG 충전소 이름 검색"은 여전히 0건. 누락 해소가 확정 범위에 명시돼 있으므로 left join이 정합.
- `app/search/page.tsx`: `useMapStore()`의 `product`를 읽어 `&product=` 전달(`:27`), `Result`에 `product` 추가, 결과 행에 유종 라벨(`PRODUCT_LABEL`) + 셀프 배지(`isSelf` — 이미 응답에 존재, §1.2) 렌더. 가격 null이면 "가격 정보 없음" 표기.

### FR-2. 상세 가격추이 유종 탭 (기대 효과: 내 연료 기준 추이/기록 / 비용: 중)
- `app/station/[id]/page.tsx`는 서버 컴포넌트(§1.3)이므로 추이 섹션(:110~113)을 **클라이언트 래퍼 컴포넌트 신설**로 교체: 래퍼가 탭 상태(`useState<ProductCode>`)를 갖고 `PriceHistoryChart`에 product를 내려보냄 — 차트는 props 변경 시 자동 재조회하므로(§1.3) 추가 배선 불필요. **검증 완료: 이 방식 성립.**
- 진입 시 기본 유종: 래퍼(클라이언트)에서 `useMapStore().product` 읽기 — zustand는 클라이언트 컴포넌트에서 바로 사용 가능. 단, 해당 주유소에 그 유종 가격이 없으면 가격 있는 첫 유종으로 폴백 권장.
- 탭 노출 유종 목록: `detail.prices`는 **5개 키 전부**를 갖되 없는 유종은 null(`lib/db/queries.ts:430~437` priceMap 초기화 + prices_latest 전 유종 조회). 실데이터는 sync 4종(B027/B034/D047/C004)만 적재(§1.6) → **탭 = detail.prices에서 가격이 non-null인 유종만**(PRODUCT_ORDER 순). K015는 자연히 미노출(이력도 없어 빈 차트 방지).
- 주유기록 단가: `:134`의 `detail.prices.B027?.price` 고정을 선택 유종 단가로. FuelLogButton(:134 CTA 섹션)과 추이 섹션이 떨어져 있으므로, plan에서 (a) 래퍼가 두 섹션을 함께 감싸거나 (b) 서버가 `detail.prices` 전체를 클라이언트 래퍼에 넘기고 래퍼 내부에서 FuelLogButton까지 렌더하는 방식 중 선택 필요. `FuelLogButton` props는 `unitPrice?: number | null`(components/station/FuelLogButton.tsx:15~21)이라 단가만 바꿔 끼우면 됨(주석의 "휘발유 현재가" 문구 갱신 필요).

### FR-3. 셀프 필터 칩 (기대 효과: SRS FR-1.3 이행, 저가 탐색 강화 / 비용: 소)
- `stores/map.ts`: `selfOnly: boolean` + toggle 추가(brands 패턴 §1.4 동형).
- `components/ui/FilterBar.tsx`: EV 칩 옆(스크롤 영역 `:121~153`)에 "셀프" 토글 칩 — 기존 칩과 동일 스타일(`aria-pressed`).
- `app/page.tsx:527~564`: 각 `visible*` useMemo에 `selfOnly` 필터 결합(클라이언트 필터 — 서버 재조회 불필요, brandSet과 동일 위치 확인 §1.4). 등유(K015) 칩은 범위 제외(백로그 유지, 근거 §1.6).

## 5. 확인 질문 답변 (호출측 5개 항목)

1. **검색 캐시 분리**: `/api/search`는 `revalidate = 60`(route.ts:6)이지만 핸들러가 `new URL(req.url)`로 Request를 읽으므로 **라우트 출력 자체는 동적**(정적 라우트 캐시 아님). 캐시가 걸리는 층은 Next 14가 패치한 fetch의 **데이터 캐시**(supabase-js의 PostgREST GET) — 이 앱에서 실제로 stale을 일으킨 전례 있음(커밋 15c5828/4cc93f5, `lib/db/supabase.ts:25~29`). 데이터 캐시 키는 **PostgREST 요청 URL 전체**이고 product는 `prices_latest.product=eq.<code>`로 URL에 들어가므로 **유종별 캐시가 자연 분리됨 — 캐시 키 추가 작업 불필요**. 60초 stale은 검색 가격 용도로 허용 범위(NFR-3), `getSupabaseFresh` 전환 불필요.
2. **inner join 누락 정확 범위**: §1.2 인용 + §4 FR-1. `!inner` + `eq('prices_latest.product','B027')` 때문에 B027 가격 행이 없는 주유소(LPG 전용 충전소 등)가 검색에서 완전 누락. 수정은 left join(권장) 또는 product 동적화 — 트레이드오프 §4 FR-1 참조.
3. **상세 유종 탭 배선**: 성립 확인. 상세는 async 서버 컴포넌트(`force-dynamic`), `PriceHistoryChart`는 `product` prop + deps 재조회 이미 지원, history API도 `?product=` 이미 지원 → 클라이언트 래퍼(탭 상태)만 신설하면 됨. `detail.prices`는 **전 유종 키(없으면 null)** — 탭은 non-null 유종만 노출 권장(K015 자연 제외, §1.6).
4. **셀프 필터 데이터**: bbox/radius/회색점 응답 모두 `isSelf` 실재(`lib/db/queries.ts:49,85,108`). brandSet 클라이언트 필터는 `app/page.tsx:527~564`(인용 §1.4) — selfOnly를 같은 useMemo들에 결합 가능. **예외: `nationalTop10`(전국 TOP10 크라운 핀)의 `NationalTop10Item`에는 isSelf가 없음**(`types/station.ts:134~142`) → 셀프 필터를 TOP10 핀에 적용하려면 타입/쿼리(`queryNationalTop10`, queries.ts:250~255 select) 확장 필요. plan에서 "TOP10 핀은 셀프 필터 미적용" 또는 "쿼리에 is_self 추가" 중 결정 필요.
5. **유종 표기 통일**: 공용 상수는 `types/station.ts:5~11` `PRODUCT_LABEL` 단일(중복 정의 없음, admin은 재사용 래퍼). K015 라벨은 코드 '실내등유' vs SRS '등유' — 오피넷 공식명은 '실내등유'라 코드 유지 + SRS 문서 표기만 맞추는 쪽 권장(이번 범위에선 UI 영향 없음).

## 6. 미해결/리스크

1. **K015 실데이터 적재량 미확인**: 프로덕션 `prices_latest`에 K015 행이 실제로 0건인지 DB로 확증하지 못함(코드상 sync는 K015 미적재이나, 과거 sync 버전/Opinet detailById 경유 잔존 행 가능성). 탭을 "non-null 유종만"으로 하면 리스크는 자동 흡수됨.
2. **PostgREST left join + 임베드 필터 동작**: `prices_latest(product, price)`(non-inner) + `.eq('prices_latest.product', p)`가 "부모 행 유지 + 임베드만 필터"로 동작하는 것이 PostgREST 표준이나, supabase-js 버전별 미세 차이가 있어 구현 시 mock 아닌 실 Supabase로 1회 검증 필요. 대안: 검색을 2쿼리(stations 검색 → prices_latest in(station_ids)+eq(product))로 풀면 동작이 명확(비용 소폭 증가).
3. **검색 정렬**: 현재 `order('name')`. 유종 반영 후 "가격 없는 업소"가 섞이면 정렬/배치(가격 있는 것 우선?) 결정 필요 — UX 결정 사항으로 plan에 위임.
4. **TOP10 크라운 핀 셀프 필터**(§5-4): isSelf 부재로 클라이언트 필터 불가. 범위 판단 필요(미적용으로 두는 것이 최소 변경).
5. **FuelLogButton 단가 연동 방식**(§4 FR-2): 추이 탭과 CTA 섹션이 떨어져 있어 상태 공유 설계(래퍼 범위 확장 vs 스토어) 결정 필요. 래퍼 범위를 넓히면 서버 컴포넌트 섹션 순서 재배치가 수반됨.
6. **검색 결과 유종 배지의 캐시된 다른 유종 혼선**: 검색 페이지에서 유종 전환 UI를 넣을지(홈 store 따라가기만 할지)는 UX 결정 — 홈과 동일하게 store만 따르면 전환 UI 없이도 일관성 확보(최소 범위 권장).
7. **외부 조사 한계**: 오피넷/티맵의 유종 UX는 공개 문서·소개 페이지 기반 확인이며, 앱 리뷰 단위의 정량적 불만 데이터(예: "경유 검색 안 됨" 리뷰 수)는 수집하지 못함 — 가설: 비휘발유 사용자 이탈 요인이라는 판단은 구조적 추론임.

### 참고 출처
- 내부: `app/api/search/route.ts`, `app/search/page.tsx`, `app/station/[id]/page.tsx`, `components/charts/PriceHistoryChart.tsx`, `app/api/stations/[id]/history/route.ts`, `components/ui/FilterBar.tsx`, `stores/map.ts`, `app/page.tsx`, `lib/db/queries.ts`, `lib/db/supabase.ts`, `types/station.ts`, `app/api/internal/sync-opinet/route.ts`, `docs/요구사항_명세서.md`, `docs/improvements/BACKLOG.md`, 커밋 15c5828/4cc93f5
- 외부: 오피넷 싼 주유소 찾기(https://www.opinet.co.kr/searRgSelect.do), 오피넷 앱 소개/가이드(앱스토어 id373670219 등), 나무위키 LPG 충전소(https://namu.wiki/w/LPG%20%EC%B6%A9%EC%A0%84%EC%86%8C)
