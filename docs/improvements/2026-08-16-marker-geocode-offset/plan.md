# 기획서: 주유소 지도 마커 계통 오차 보정 (카카오 주소 지오코딩 좌표 재산출)

## 배경·목표

**배경(확정 사실, 코드 확인 완료):**
- 지도 마커/회색점 좌표의 정본은 `stations.geom`이다. bbox/radius RPC(`0001_init.sql`, `0014`, `0021`)가 모두 `st_x(s.geom)/st_y(s.geom)`을 읽는다. lat/lng 컬럼이 아니다 → **좌표를 옮기려면 반드시 `geom`을 함께 갱신**해야 하고, 정합성을 위해 lat/lng도 같이 갱신한다.
- 현재 `stations`의 좌표는 `app/api/internal/sync-opinet/route.ts`(약 241줄)가 오피넷 KATEC(GIS_X_COOR/GIS_Y_COOR)을 `lib/map/katec.ts` proj4로 WGS84 변환해 매일 upsert한 값이다.
- 바탕지도가 카카오맵이라, 카카오 자체 지오코딩 위치와 오피넷 KATEC 변환 좌표가 계통적으로 어긋나 마커가 옆 건물/길 건너에 찍힌다. 사용자가 여러 마커에서 **일정 방향 ~150m 오차**를 육안 확인했다.
- 재사용 자산: `lib/geocode/kakao.ts`(주소→WGS84, 서버 전용 `KAKAO_REST_API_KEY↦KAKAO_CLIENT_ID` 폴백, 한반도 bbox(124~132E/33~39N) 내부 검증 내장, `isGeocodeConfigured()`). 고속도로 주유소 좌표를 이 헬퍼로 채우는 전례가 있다.
- 증분 순회 전례: `app/api/internal/backfill-stations/route.ts` + `sync_cursor`(`0022`). CRON_SECRET 가드, `?limit` 콜 상한, USE_MOCK/미설정 graceful skip, 커서 resume, dryRun을 모두 갖춘 완성 구조 → **그대로 복제**한다.
- 카카오 로컬 API 한도: 일 100,000 / 초당 제한. 주유소는 ~1.1만 곳(1회 전량 지오코딩 시 여유 있음이나, sync마다 전량 호출은 금지).

**목표(이번 사이클 완료 시 사용자가 얻는 것):** 지도 마커가 실제 주유소 위치에 눈에 띄게 더 정확히 찍히고, 계통 오차의 방향·크기가 수치로 확정된다.

## 유저 스토리
- 지도를 보는 이용자로서, 주유소 마커가 실제 건물 위치에 찍히기를 원한다. 그래서 길 건너/옆 건물이 아니라 내가 가려는 그 주유소를 바로 신뢰할 수 있다.
- 운영자로서, 좌표 보정을 증분·안전하게(할당량·비용 통제, 실패 시 원본 보존) 돌리고 결과(채택률·오프셋)를 확인하고 싶다. 그래서 잘못된 지오코딩으로 오히려 나빠지는 일 없이 점진 개선할 수 있다.

## 기능 요구사항

### FR-1: `backfill-geocode` 증분 라우트 신설 (가드 채택 + 오프셋 측정)
- **설명:** `app/api/internal/backfill-geocode/route.ts`를 신설한다. `backfill-stations`의 구조(CRON_SECRET 가드, graceful skip, `sync_cursor` 커서 resume, `?limit` 콜 상한, 요청 간 딜레이, `dryRun`, 응답 로그 필드)를 복제한다. `stations`를 결정적 순서(`id` 오름차순)로 페이지네이션 순회하며, 각 주유소 주소(`address`, 오피넷 적재 시 NEW_ADR 우선)를 `lib/geocode/kakao.ts`의 `geocode()`로 지오코딩한다. **가드(FR-2) 통과분만** `stations.lat/lng/geom`을 지오코딩 좌표로 갱신하고, 처리 중 오프셋을 집계(FR-2·성공지표)해 응답으로 반환한다.
- **커서 key:** `sync_cursor`에 새 key `'backfill_geocode'`를 사용한다(`backfill_stations`와 독립). 커서 테이블 부재/로드 실패 시 idx=0부터 시작하고 커서 저장은 best-effort로 무시(기존 폴백과 동일).
- **수용 기준(AC):**
  - AC-1-1: `Authorization: Bearer ${CRON_SECRET}`가 아니거나 `CRON_SECRET` 미설정이면 403을 반환한다(빈값 우회 차단).
  - AC-1-2: `NEXT_PUBLIC_USE_MOCK=true` 또는 Supabase 미설정 또는 `isGeocodeConfigured()===false`이면 `{ skipped:true, reason:... }`(200)로 즉시 반환하고 좌표를 전혀 변경하지 않는다.
  - AC-1-3: `?limit=N`으로 이번 run의 **카카오 지오코딩 호출 상한**을 제한한다(기본값은 backfill-stations와 유사한 보수적 값, 예: 500). 상한 도달 시 순회를 멈추고 커서를 마지막 처리 지점에 저장해, 다음 run이 그 다음 주유소부터 이어간다(resume). 한 바퀴 순환 시 `wrapped` 플래그를 응답에 표시한다.
  - AC-1-4: 카카오 호출 사이에 요청 간 딜레이(예: 80ms 이상)를 두어 초당 제한을 피한다.
  - AC-1-5: `dryRun=1`이면 지오코딩·오프셋 집계는 수행하되 `stations` write와 커서 저장을 하지 않는다.
  - AC-1-6: 응답 JSON에 최소 다음 필드를 포함한다: `attempted`(시도 수), `geocodeCalls`(실제 카카오 호출 수), `adopted`(채택 수), `adoptRate`, `rejected`(가드 탈락 수), `geocodeFailed`(카카오 null 반환 수), `noAddress`(주소 없음 수), `updated`(실제 write 행 수), `cursor{start,last,saved,wrapped}`, `limit`, `dryRun`, `offset`(FR-2 집계), `errors`(있을 때만). — QA/운영자가 응답만으로 실행 결과와 할당량 소비를 확인할 수 있다.

### FR-2: 채택 가드 + 오프셋 집계 (파괴 방지가 핵심)
- **설명:** 지오코딩 결과를 무조건 반영하지 않는다. (a)한반도 bbox(33~39N/124~132E) 안이고 — 이 검증은 `kakao.ts`가 이미 내장, (b)기존 오피넷 좌표(현재 `stations.lat/lng`)와 **1.5km 이내**일 때만 채택한다. 벗어나면(엉뚱한 매칭/동명 오검색) 기존 좌표를 유지한다. 채택 시에만 `lat/lng/geom`을 지오코딩 좌표로 갱신한다. 처리 중 (지오코딩좌표 − 오피넷좌표)의 **북(위도)·동(경도) 성분(m)**과 **거리(m)**를 채택분 기준으로 누적해 통계를 낸다.
- **수용 기준(AC):**
  - AC-2-1(불변): 지오코딩이 null이거나, bbox 밖이거나, 기존 좌표와 1.5km를 초과하면 그 주유소의 `lat/lng/geom`을 **변경하지 않는다**(원본 오피넷 좌표 유지). 전체 삭제/무조건 덮어쓰기는 어떤 경로로도 발생하지 않는다.
  - AC-2-2: 채택 시 `geom`은 `SRID=4326;POINT(lng lat)` WKT로, lat/lng와 정합되게 함께 갱신한다(geom만/좌표만 갱신되는 불일치가 없다).
  - AC-2-3: 1.5km 임계는 코드 상단 상수로 두어(예: `ADOPT_MAX_DISTANCE_M = 1500`) 조정 가능하게 한다.
  - AC-2-4: 응답 `offset`에 채택분의 `count`, 북/동 성분의 `meanNorthM`/`meanEastM`, 거리의 `meanM`/`medianM`을 포함한다. 이 값으로 계통 오차의 방향(예: "북동 약 150m")과 크기를 확정해 보고한다.
  - AC-2-5: dryRun 실행에서도 offset 집계는 정상 산출되어, write 전에 계통 오차 규모를 먼저 검증할 수 있다.

### FR-3: 출처/원본 보존 마이그레이션(0039) + sync-opinet 정합성(카카오 좌표 파괴 금지)
- **설명:** `supabase/migrations/0039_*.sql`로 `stations`에 `coord_source text`('kakao'|'opinet'), 원본 오피넷 좌표 보존 컬럼 `opinet_lat double precision` / `opinet_lng double precision`을 추가한다(모두 nullable, 기본 미설정). backfill이 채택할 때 `coord_source='kakao'`로 표시하고, 덮어쓰기 전 오피넷 좌표를 `opinet_lat/lng`에 1회 보존한다. 그리고 sync-opinet이 매일 좌표를 덮어써 카카오 채택분을 원위치로 되돌리는 것을 막는다. **0039 미적용(컬럼 부재) 환경에서도 앱·두 라우트가 깨지지 않아야 한다.**
- **수용 기준(AC):**
  - AC-3-1: 마이그레이션은 `add column if not exists`로 idempotent하며, 적용은 운영자 몫이다. **미적용 상태에서도** 홈/지도/상세 등 앱 전 기능과 sync-opinet·backfill-geocode 라우트가 정상 동작한다(컬럼 부재 시 graceful degrade).
  - AC-3-2(정합성, 불변): sync-opinet은 (i)신규 주유소(기존 행 없음)에는 오피넷 좌표로 lat/lng/geom 초기 세팅을 계속 하되, (ii)이미 `coord_source='kakao'`로 채택된 기존 행의 `lat/lng/geom`은 **덮어쓰지 않는다**. 즉 매일 sync 후에도 카카오 채택 좌표가 원위치로 되돌아가지 않는다.
  - AC-3-3(현실적 구현 옵션 — 개발자 선택, 제약 명시): 아래 중 하나 이상으로 AC-3-2를 만족시킨다.
    - (옵션 A) 대량 upsert의 좌표 컬럼을 조건부 처리: 사전에 `coord_source='kakao'`인 id 집합을 조회해, upsert row에서 그 id들은 `lat/lng/geom`을 payload에서 제외하고 나머지 컬럼(이름/브랜드/주소/가격 관련 메타)만 갱신한다.
    - (옵션 B) 좌표를 upsert 본류에서 분리: 이름/메타는 전량 upsert하되 좌표는 `coord_source`가 'kakao'가 아닌(또는 null) 행에만 별도 update로 반영한다.
    - (옵션 C) 0039 미적용(컬럼 부재)일 때는 기존 동작(전량 좌표 upsert)을 유지한다 — 이 경우 backfill의 카카오 좌표는 다음 sync에 덮이므로, **0039 적용을 backfill 채택 좌표를 살리기 위한 전제 조건으로 문서화**한다.
    - 제약: 어떤 옵션을 택하든 (1)`prices_latest`/`prices_history`는 건드리지 않고, (2)신규 주유소 좌표 초기 세팅은 유지하며, (3)stale 가격 정리 등 기존 가드를 훼손하지 않는다. **불변 AC는 "카카오 채택 좌표(coord_source='kakao')를 sync가 파괴하지 않는다".**
  - AC-3-4: backfill-geocode는 컬럼 존재 시 채택 행에 `coord_source='kakao'`와 `opinet_lat/opinet_lng`(덮기 전 원본, 이미 채워져 있으면 보존)를 기록한다. 컬럼 부재 시에는 이 필드를 payload에서 제외해도 라우트가 오류 없이 좌표만 갱신한다(graceful degrade). 컬럼 존재 여부는 안전하게 감지(예: information_schema 조회 또는 write 실패 시 폴백)한다.

## 범위

**포함(In):**
- `app/api/internal/backfill-geocode/route.ts` 신설(FR-1).
- 채택 가드(bbox 내장 + 1.5km) + 오프셋 집계(FR-2).
- `supabase/migrations/0039_*.sql`(coord_source, opinet_lat, opinet_lng) 신설(FR-3).
- sync-opinet 정합성 최소 수정(카카오 채택 좌표 보존, FR-3 AC-3-2/3-3).

**제외(Out — BACKLOG 이관 후보 및 사유):**
- 카카오 keyword 폴백 튜닝(주소 실패 시 상호명 검색 정교화): 이번엔 주소 지오코딩 + 1.5km 가드로 안전 확보가 우선. 채택률 저조 시 다음 사이클.
- 크론 자동 등록: 운영자 수동 실행/등록 몫(범위 밖). 라우트 자체는 이번에 완성.
- 지오코딩 결과 캐시 테이블: 재실행 비용 최적화는 규모(1.1만)상 당장 불필요. YAGNI.
- EV 충전소/세차장 등 다른 레이어 좌표 동일 보정: 별개 데이터·별개 사이클.

## 성공 지표 (사이클 후 확인 가능)
- backfill 1회(또는 커서 한 바퀴) 완주 후 응답의 `adoptRate`(kakao 채택 / 전체 시도)를 확인 — 채택률이 유의미하게 높다(잘못된 매칭이 가드로 걸러진 잔여가 소수).
- 응답 `offset.meanNorthM`/`meanEastM`/`meanM`/`medianM`으로 계통 오프셋의 방향·크기를 수치 확정(사용자 관측 ~150m 방향과 정합 확인).
- 지도에서 임의 표본 마커 육안 확인 시, 보정 후 마커가 실제 주유소 건물 위치에 더 정확히 찍힌다(길 건너/옆 건물 오차 감소).
- 안전성: dryRun→실행→다음날 sync-opinet 후에도 채택 좌표가 유지된다(원위치 회귀 없음).

## SRS 반영 제안 (제안만, 직접 수정 금지)
- §데이터 모델(약 127줄, `stations` 컬럼 설명): `coord_source`, `opinet_lat`, `opinet_lng` 컬럼과 "좌표 정본은 geom이며 backfill-geocode가 카카오 채택 좌표의 정본, sync-opinet은 카카오 채택 행 좌표를 보존" 규칙을 한 줄 추가 제안.
- §내부/크론 API 목록: `backfill-geocode`(증분 지오코딩 좌표 보정, CRON_SECRET, `?limit`, dryRun, graceful skip)를 `backfill-stations`와 나란히 등재 제안.
- §외부 의존/Mock(§9 계열, 약 208줄): 카카오 로컬 지오코딩을 좌표 보정용 외부 의존으로 명시하고 "키 미설정 시 좌표 미변경 skip"을 Mock 우선 원칙 사례로 추가 제안.
- 위 제안은 기존 SRS와 충돌하지 않으며(geom 정본 서술과 정합), 충돌 요소 없음.

## 미해결/리스크
- **정합성 구현 난이도(핵심 리스크):** 대량 upsert(수천~수만 행)에서 특정 id의 좌표만 보존하려면 사전 `coord_source='kakao'` id 조회가 필요하다. 채택 규모가 커지면 이 조회/분기 비용과 payload 구성 복잡도가 오른다. FR-3 AC-3-3의 옵션 A/B 중 성능·안정성 실측으로 택하고, 최악의 경우 옵션 C(0039 적용 전 기존 동작 유지)로 안전 폴백. 개발 착수 시 실제 채택 id 수를 dryRun으로 먼저 가늠할 것.
- **컬럼 존재 감지 방식:** 0039 미적용 감지를 information_schema 조회로 할지, write 실패(undefined column) 캐치 폴백으로 할지 결정 필요. 후자는 부분 실패 시 재시도 로직이 복잡해질 수 있어, 라우트 시작 시 1회 스키마 감지 후 분기하는 편을 권장(개발자 판단).
- **1.5km 임계의 적정성:** 계통 오차가 ~150m이므로 1.5km는 넉넉하다. 다만 지오코딩이 인접 동명 주유소/도로명 매칭 실패로 300~800m 떨어진 엉뚱한 지점을 반환하면 이 임계 안에 들어와 채택될 수 있다. 1차 실행은 dryRun으로 offset 분포(특히 꼬리값)를 보고, 필요 시 임계를 좁히거나(예: 500m) keyword 폴백 튜닝(Out)을 다음 사이클로 넘긴다.
- **주소 품질:** `stations.address`가 오피넷 NEW_ADR 기반이나 일부 null/구주소(VAN_ADR)일 수 있어 `noAddress`/`geocodeFailed`가 예상보다 클 수 있다. 채택률이 낮으면 keyword 폴백(Out)이 다음 우선순위.
- **카카오 할당량:** 1.1만 곳 × 1회면 일 100,000 한도 대비 여유지만, 재실행 누적·초당 제한을 고려해 `?limit`과 딜레이로 통제한다. 응답 `geocodeCalls` 필드로 매 run 소비를 모니터링.
- **좌표 회귀 검증 타이밍:** AC-3-2의 "sync 후 유지"는 실제로 다음 sync-opinet 실행 이후에야 확증 가능하다. QA는 backfill 실행 → sync-opinet 1회 수동 실행 → 채택 표본 좌표 불변 확인 순으로 검증할 것.
