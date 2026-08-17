# QA 리포트: 주유소 지도 마커 계통 오차 보정 (카카오 주소 지오코딩)

> QA 수행: 2026-08-17 · 대상 변경: 미커밋(신규 2파일 + 수정 1파일) · 기준: `plan.md` FR-1/2/3, AC 전항

## 판정: 조건부 통과

- **정적 검증**(typecheck / lint / build): 무오류 — 통과.
- **API 레벨 검증**(curl, dev 서버 2대): 가드 계열 AC(AC-1-1, AC-1-2 3조건 전부) 실측 통과.
- **실데이터 검증**(채택률·오프셋 수치 확정): **미수행(환경 제약)**. 이 환경의 `.env.local`에는 `KAKAO_REST_API_KEY`/`KAKAO_CLIENT_ID`가 없고(→ `isGeocodeConfigured()===false`) 외부 네트워크도 없어, 카카오 로컬 API 호출·오피넷 좌표 대조가 원천적으로 불가능하다. 따라서 **AC-1-3~1-6 / AC-2-1~2-5 / AC-3-2·3-4는 코드 레벨 검증**으로 대체했다.
- AC 실패는 **1건도 관측되지 않았다**. 미확인 항목은 전적으로 위 환경 제약(키·네트워크·프로덕션 DB 부재)에 기인하므로 **조건부 통과**로 판정한다.
- 실측 확정(채택률 `adoptRate`, 계통 오프셋 `offset.meanNorthM/meanEastM/meanM/medianM`)은 **운영자가 dryRun 1회 실행으로 수행**해야 한다(아래 "운영자 후속 작업").

---

## 정적 검증

| 단계 | 명령 | 결과 |
|---|---|---|
| 타입 | `npm run typecheck` (`tsc --noEmit`) | ✅ 무오류 |
| 린트 | `npm run lint` (`next lint`) | ✅ `No ESLint warnings or errors` |
| 빌드 | `npm run build` | ✅ 성공(전 라우트 생성, 오류 없음) |

---

## API 레벨 시나리오 결과 (curl)

두 개의 dev 서버로 가드 3분기를 모두 태웠다.
- **포트 3457**: `NEXT_PUBLIC_USE_MOCK=true`, `CRON_SECRET=qa-secret` → Mock skip 분기.
- **포트 3458**: `NEXT_PUBLIC_USE_MOCK=false`, `CRON_SECRET=qa-secret` → Supabase 설정은 있으나 카카오 키 부재 → geocode skip 분기.

| AC | 절차 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| AC-1-1 | `Authorization` 헤더 없이 호출 | 403 | `{"error":"forbidden"}` HTTP 403 | ✅ |
| AC-1-1 | `Authorization: Bearer wrong` | 403 | `{"error":"forbidden"}` HTTP 403 | ✅ |
| AC-1-1(빈값 우회) | `CRON_SECRET` 미설정 시 무조건 거부 | 403 | 코드 상 `secret.length === 0` 선차단(`route.ts:93`) — `backfill-stations`와 동일 패턴 | ✅(코드) |
| AC-1-2 | Mock 모드 + 정상 토큰 | `{skipped:true}` 200, 좌표 무변경 | `{"skipped":true,"reason":"mock mode"}` HTTP 200 | ✅ |
| AC-1-2 | 카카오 키 부재 + `dryRun=1&limit=5` | `{skipped:true}` 200 | `{"skipped":true,"reason":"kakao geocode key missing"}` HTTP 200 | ✅ |
| AC-1-2 | Supabase 미설정 | `{skipped:true}` 200 | 코드 상 `isSupabaseConfigured()` 분기(`route.ts:100`) | ✅(코드) |

세 skip 분기 모두 **DB·카카오 접근 이전에 반환**하므로 "좌표를 전혀 변경하지 않는다"가 구조적으로 보장된다.

---

## 코드 레벨 검증 (실데이터 불가 항목)

| AC | 근거 |
|---|---|
| AC-1-3 (`?limit` 콜 상한 + resume) | `callLimit` 파싱(기본 500) → 순회 루프 조건 `geocodeCalls < callLimit`, 내부 `break outer`. 중단 시 `lastProcessedIdx` 저장, 다음 run 은 `(idx+1) % total` 부터 시작. `curOffset >= total` 시 `wrapped=true`. |
| AC-1-4 (요청 간 딜레이) | `REQUEST_DELAY_MS = 80`, 매 `geocode()` 직후 `await sleep()`. |
| AC-1-5 (dryRun) | `updates` 큐에 담기만 하고 `if (!dryRun && updates.length > 0)` 에서만 write. 커서 저장도 `!dryRun` 조건. 오프셋 집계는 루프 안에서 무조건 수행 → AC-2-5 동시 충족. |
| AC-1-6 (응답 필드) | 응답 JSON에 `attempted/geocodeCalls/adopted/adoptRate/rejected/geocodeFailed/noAddress/updated/cursor{start,last,saved,available,wrapped}/limit/dryRun/offset/errors` 전부 존재. |
| AC-2-1 (불변: 파괴 금지) | `geo` null → `continue`(write 큐 미추가). bbox 밖 → `lib/geocode/kakao.ts`가 이미 null 반환. `dist > 1500` → `rejected++` 후 `continue`. 세 경로 모두 `updates.push` 에 도달하지 않는다. write 는 `.update().eq('id', id)` 단건뿐이라 전체 덮어쓰기/삭제 경로가 없다. |
| AC-2-2 (lat/lng/geom 정합) | 채택 행 payload가 `lat`, `lng`, `geom: 'SRID=4326;POINT(lng lat)'` 를 **한 객체에서 동시 구성** → 부분 갱신 불가. |
| AC-2-3 (임계 상수화) | `const ADOPT_MAX_DISTANCE_M = 1500;` 파일 상단, 응답에도 `adoptMaxDistanceM` 로 노출. |
| AC-2-4 (오프셋 통계) | 하버사인 거리 + 북/동 성분(`M_PER_DEG`, 경도는 `cos(lat)` 보정) 누적 → `count/meanNorthM/meanEastM/meanM/medianM`. |
| AC-3-1 (idempotent + 미적용 안전) | `0039` 전량 `add column if not exists`. 라우트는 시작 시 `select('coord_source').limit(1)` 1회로 컬럼 존재를 감지해 `columnsAvailable` 분기(select 컬럼 목록·payload 모두). |
| AC-3-4 (출처/원본 기록) | 컬럼 존재 시 `coord_source='kakao'` + `opinet_lat/lng`(기존 값 있으면 보존, 없으면 덮기 전 좌표). 부재 시 해당 필드 제외. |

### AC-3-2 (sync-opinet 정합성) — 옵션 A 채택 검증

`stations.geom`이 **`not null`** 임을 `supabase/migrations/0001_init.sql:23` 에서 확인했다. PostgREST 대량 upsert는 payload 키 합집합으로 INSERT 컬럼을 잡으므로, 좌표 포함 행과 제외 행을 한 배치에 섞으면 제외 행의 `geom`이 NULL이 되어 **NOT NULL 위반**이 난다. 구현은 이를 피해 배치를 2개로 분리한다:

- `fullStationRows` — 좌표 포함(신규 + 오피넷/미분류 행) → 신규 주유소 좌표 초기 세팅 유지, `geom` NOT NULL 충족.
- `metaOnlyRows` — `coord_source='kakao'` 인 **기존** 행. `lat/lng/geom`을 payload에서 제외하고 메타만 upsert → 항상 conflict-update 경로 → 카카오 좌표 보존.

제약 3항도 충족: `prices_latest`/`prices_history` 미변경, 신규 좌표 세팅 유지, stale 가드 미훼손(`fetchErrors`는 보고 전용이며 stale 판정은 `topFetchFailed`/`topEmpty` 기반 — 신규 `kakao coord lookup skipped` 메시지가 `failRatio`에 영향을 주지 않음을 확인).

옵션 C 폴백도 존재: kakao id 조회가 실패하면(0039 미적용 = `coord_source` 컬럼 부재 포함) 빈 집합으로 두어 **기존 전량 upsert 동작을 그대로 유지**한다. 응답에 `coordPreserved`(보존 행 수)를 노출한다.

---

## QA 중 반영한 수정

- `backfill-geocode/route.ts`: 사용하지 않는 상수 `UPDATE_CHUNK` 제거(실제 update는 id 단위 순차라 청크 개념이 없음 — 오해 소지 있는 사문화 코드).

---

## 미확인 항목 (환경 제약)

1. **채택률·오프셋 실측**: 카카오 키·네트워크·프로덕션 데이터 부재로 불가. `plan.md` 성공 지표(사용자 관측 "~150m 계통 오차"와의 정합 확인)는 운영자 dryRun으로만 확정 가능.
2. **좌표 회귀 검증(AC-3-2 실행 확증)**: "backfill 실행 → sync-opinet 1회 → 표본 좌표 불변"은 실제 두 라우트를 프로덕션에서 순차 실행해야 확증된다. 이번 QA는 코드 레벨(배치 분리 + geom NOT NULL 근거)까지.
3. **1.5km 임계 적정성**: 오프셋 분포의 꼬리값을 봐야 판단 가능 → dryRun 결과 확인 후 필요 시 상수 조정.

---

## 운영자 후속 작업 (순서 준수)

1. **`0039` 적용**: `supabase/migrations/0039_station_coord_source.sql`를 Supabase SQL Editor에서 실행. **backfill 채택 좌표를 살리려면 이 적용이 선행 전제 조건이다**(미적용 시 채택 좌표가 다음 sync에 덮인다 — 옵션 C 폴백).
2. **dryRun 관측**: `GET /api/internal/backfill-geocode?dryRun=1&limit=500` (`Authorization: Bearer ${CRON_SECRET}`). 응답의 `offset.meanNorthM/meanEastM/meanM/medianM`으로 계통 오차 방향·크기를 확정하고, `adoptRate`·`rejected`로 가드 작동을 확인한다. 꼬리값이 크면 `ADOPT_MAX_DISTANCE_M`을 500m로 좁히는 것을 검토.
3. **실행**: dryRun 수치가 납득되면 `?limit=500`(dryRun 없이) 반복 실행으로 커서를 한 바퀴 돌린다(약 11,000곳 ÷ 500 ≈ 22회, 응답 `cursor.wrapped=true` 로 완주 판정). `geocodeCalls`로 일 100,000 한도 소비 모니터링.
4. **회귀 확인**: 다음 `sync-opinet` 실행 후 응답의 `coordPreserved`가 채택 수와 맞는지, 표본 주유소 좌표가 원위치로 돌아가지 않았는지 확인.
5. **크론 등록(선택)**: 범위 밖. 1회 완주 후 신규 주유소 대상 저빈도 스케줄 등록을 검토.
