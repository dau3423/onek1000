# 사이클 요약: 주유소 지도 마커 계통 오차 보정 (카카오 주소 지오코딩)

> 완료일: 2026-08-17 · 백엔드 전용 사이클(UI 변경 없음 → `design.md` 해당 없음)

## 주제·선정 이유
사용자가 지도에서 여러 주유소 마커가 **일정 방향으로 ~150m 어긋나** 옆 건물/길 건너에 찍히는 것을 육안 확인했다. 원인은 좌표 출처 불일치다 — `stations` 좌표는 `sync-opinet`이 오피넷 KATEC(`GIS_X_COOR/GIS_Y_COOR`)을 proj4로 WGS84 변환한 값인데, 바탕지도는 카카오맵이라 카카오 자체 지오코딩 위치와 계통적으로 어긋난다. 이미 보유한 `lib/geocode/kakao.ts`(주소→WGS84, 한반도 bbox 검증 내장)와 `backfill-stations`의 증분 순회 구조를 재사용하면 낮은 비용으로 좌표를 카카오 기준으로 옮길 수 있어 채택했다.

## 단계별 산출물
- 기획(FR/AC): [plan.md](plan.md)
- QA 리포트: [qa-report.md](qa-report.md)

## FR별 구현 요약
- **FR-1 `backfill-geocode` 증분 라우트**: `app/api/internal/backfill-geocode/route.ts` 신설. `backfill-stations` 구조 복제 — CRON_SECRET 빈값 가드(403), Mock/Supabase/카카오키 미설정 graceful skip, `sync_cursor('backfill_geocode')` 커서 resume(`wrapped` 플래그), `?limit`(기본 500) 카카오 호출 상한, 요청 간 80ms 딜레이, `dryRun=1`. `stations`를 `id` 오름차순 페이지네이션(1,000행)으로 순회하며 `address`를 `geocode()`에 넘긴다. 응답에 `attempted/geocodeCalls/adopted/adoptRate/rejected/geocodeFailed/noAddress/updated/cursor/offset/errors` 노출.
- **FR-2 채택 가드 + 오프셋 집계**: 한반도 bbox(`kakao.ts` 내장) **+ 기존 오피넷 좌표와 하버사인 거리 `ADOPT_MAX_DISTANCE_M=1500` 이내**일 때만 채택. 탈락 시 원본 좌표 유지(`rejected`). 채택 시에만 `lat/lng/geom`을 한 payload로 동시 갱신(`SRID=4326;POINT(lng lat)`). write는 upsert가 아니라 `.update().eq('id')` 단건 — 부분 payload upsert가 `stations`의 NOT NULL INSERT 절을 건드리는 문제 회피. 채택분의 북/동 성분(m, 경도는 `cos(lat)` 보정)·거리를 누적해 `offset{count,meanNorthM,meanEastM,meanM,medianM}` 산출(dryRun에서도 집계).
- **FR-3 출처 보존 + sync 정합성**: `supabase/migrations/0039_station_coord_source.sql` 신설(`coord_source`, `opinet_lat`, `opinet_lng` — 전량 `add column if not exists`). backfill은 시작 시 `select('coord_source').limit(1)` 1회로 컬럼 존재를 감지해 분기(`columnsAvailable`), 채택 행에 `coord_source='kakao'`와 덮기 전 원본 좌표를 1회 보존(이미 있으면 유지). `sync-opinet`은 **옵션 A** 채택 — 사전에 `coord_source='kakao'` id 집합을 조회해 upsert를 두 배치로 분리한다: 좌표 포함(`fullStationRows`, 신규 좌표 초기 세팅 유지 · `geom` NOT NULL 충족) / 좌표 제외 메타만(`metaOnlyRows`, 카카오 좌표 보존). id 조회 실패·컬럼 부재면 빈 집합 → **기존 전량 upsert로 폴백**(옵션 C). 응답에 `coordPreserved` 추가.

## 변경 파일
- 신규(3): `app/api/internal/backfill-geocode/route.ts`, `supabase/migrations/0039_station_coord_source.sql`, `docs/improvements/2026-08-16-marker-geocode-offset/`(plan/qa-report/cycle-summary)
- 수정(1): `app/api/internal/sync-opinet/route.ts`(카카오 채택 좌표 보존 배치 분리 + `coordPreserved` 응답)

## 리뷰·QA 판정
- **QA: 조건부 통과**. typecheck/lint/build 전부 무오류. curl 실측으로 가드 계열 AC 전부 통과(무헤더 403 / 오토큰 403 / Mock skip 200 / 카카오키 부재 skip 200). 나머지 AC는 코드 레벨 검증(근거는 `qa-report.md` 표 참조) — 관측 실패 0건.
- **미수행**: 채택률·오프셋 **실측**과 좌표 회귀 확증. 이 환경에 카카오 키·외부 네트워크·프로덕션 데이터가 없어 원천적으로 불가 — 앱 결함 아님. 운영자 dryRun 1회로 확정한다.
- QA 중 반영: `UPDATE_CHUNK` 사문화 상수 제거.

## 실측 결과 (2026-08-17) — 사이클의 전제가 뒤집혔다

0039 적용 후 dryRun(`limit=500`, 시도 946 / 채택 500, 전체 10,731곳)을 실제 수행했다:

- adoptRate **1.0**(rejected 0, geocodeFailed 0) · noAddress **47%**
- 평균 27.3m · 중앙값 20.3m · p90 44.6m · p95 64.1m · max 526.3m
- 방향 성분 북 −12.2m / 동 +7.5m → **합성 14.3m < 평균 거리 27.3m**

→ **계통 오차는 ~150m가 아니라 ~20m이고, 일정 방향 편향이 아니라 무작위 산포다.** 오피넷 KATEC 변환은
사실상 정확하다. 전량 실행해도 마커는 평균 20m 움직여 육안 효과가 없으므로 **실행 보류를 권고**한다.
가드는 정상 작동했고 꼬리가 짧아(p95 64m) 1.5km 임계를 좁힐 실익도 없다(리스크 항목 해소).

관측된 ~150m의 유력한 원인은 좌표가 아니라 **마커 이미지의 anchor 지점**이다 — 핀 끝이 아닌 중앙이
좌표에 물리면 화면상 항상 같은 방향으로 밀리고, 줌에 따라 미터 환산값이 달라진다. 다음 조사 대상.

## 후속(운영자 작업)
1. ~~`0039` 적용~~ · ~~dryRun 관측~~ — **완료(2026-08-17)**.
2. **전량 실행은 보류 권고**(위 실측). 실행 시 `?limit=500`을 `cursor.wrapped=true` 까지 반복(약 22회, 카카오 호출 ~5,600건). 라우트는 완성·검증 상태라 언제든 실행 가능하다.
3. **우선 조사: `lib/map/*Marker.ts` 의 anchor/offset** — 좌표 backfill보다 비용이 훨씬 작다.
4. **회귀 확인(2를 실행한 경우에만)**: 다음 `sync-opinet` 응답의 `coordPreserved`와 표본 좌표 불변 확인.

## 미해결·리스크
- **1.5km 임계의 적정성**: 계통 오차가 ~150m라 1.5km는 넉넉하지만, 인접 동명 주유소/도로명 매칭 실패로 300~800m 떨어진 지점이 임계 안에 들어와 채택될 수 있다. dryRun의 오프셋 꼬리값을 보고 필요 시 500m로 좁힌다.
- **주소 품질**: `stations.address`는 NEW_ADR 우선이나 일부 null/구주소(VAN_ADR)라 `noAddress`/`geocodeFailed`가 예상보다 클 수 있다. 채택률 저조 시 keyword(상호명) 폴백 튜닝이 다음 우선순위(이번 범위 밖).
- **재실행 시 할당량**: 커서가 한 바퀴 돌면 이미 `coord_source='kakao'`인 행도 다시 지오코딩한다(거리 ≈ 0이라 항상 재채택). 완주 후 재실행은 신규 주유소만 대상으로 하도록 필터를 두는 편이 낫다 — 후속 제안.
- **오프셋 통계 편향**: `opinet_lat/lng`가 없는 채로 이미 카카오 좌표가 된 행을 재순회하면 오프셋이 0에 수렴해 통계가 희석된다. **첫 dryRun 수치를 계통 오차의 기준값으로 기록해 둘 것.**
- **커서 인덱스 드리프트**: 순회 기준이 `id` 오프셋이라, run 사이에 sync가 신규 주유소를 넣으면 오프셋이 밀려 일부가 건너뛰어질 수 있다. 한 바퀴 완주 관점에서는 허용 가능(다음 바퀴에 포착).

## 다음 사이클 제안
1. **좌표 품질 v2 — keyword 폴백 + 미채택 잔여 처리**: dryRun 실측 채택률을 근거로 주소 실패분에 상호명 검색 폴백을 붙이고, `rejected` 행을 관리자 화면에서 표본 검수.
2. **EV 충전소·세차장 좌표 동일 보정**: 같은 계통 오차가 다른 레이어에도 있는지 표본 확인 후 파이프라인 재사용.
