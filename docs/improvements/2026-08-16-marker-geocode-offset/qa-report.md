# QA 리포트: 주유소 지도 마커 계통 오차 보정 (카카오 주소 지오코딩)

> QA 수행: 2026-08-17 · 대상 변경: 미커밋(신규 2파일 + 수정 1파일) · 기준: `plan.md` FR-1/2/3, AC 전항

## 판정: 조건부 통과

- **정적 검증**(typecheck / lint / build): 무오류 — 통과.
- **API 레벨 검증**(curl, dev 서버 2대): 가드 계열 AC(AC-1-1, AC-1-2 3조건 전부) 실측 통과.
- **실데이터 검증**(채택률·오프셋 수치 확정): **미수행(환경 제약)**. 이 환경의 `.env.local`에는 `KAKAO_REST_API_KEY`/`KAKAO_CLIENT_ID`가 없고(→ `isGeocodeConfigured()===false`) 외부 네트워크도 없어, 카카오 로컬 API 호출·오피넷 좌표 대조가 원천적으로 불가능하다. 따라서 **AC-1-3~1-6 / AC-2-1~2-5 / AC-3-2·3-4는 코드 레벨 검증**으로 대체했다.
- AC 실패는 **1건도 관측되지 않았다**. 미확인 항목은 전적으로 위 환경 제약(키·네트워크·프로덕션 DB 부재)에 기인하므로 **조건부 통과**로 판정한다.
- **[2026-08-17 갱신]** 0039 적용 후 dryRun 실측을 수행했다 → 아래 "실측" 절 참조. **계통 오차는 ~20m·무작위 산포로, 사용자 관측 ~150m와 일치하지 않는다.** 전량 실행 보류를 권고하며 원인 후보를 마커 anchor로 재지목한다.

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

## 실측 (2026-08-17 추가 — 0039 적용 후 dryRun 수행)

운영자가 `0039`를 적용한 뒤, 프로덕션 Supabase + 카카오 로컬 API로 dryRun을 실제 수행했다
(`KAKAO_CLIENT_ID`가 `apphosting.yaml`의 평문 value이고 `lib/geocode/kakao.ts`가 이를 폴백으로 쓴다).
dryRun은 write가 없어 프로덕션 데이터에 영향이 없다. 응답 `columnsAvailable: true`로 0039 적용을 라우트 레벨에서도 재확인했다.

`GET /api/internal/backfill-geocode?dryRun=1&limit=500` → 전체 10,731곳, 시도 946건, 채택 500건:

| 항목 | 값 |
|---|---|
| adoptRate | **1.0** (rejected 0, geocodeFailed 0) |
| noAddress | **446 / 946 = 47%** |
| 평균 거리 / 중앙값 | 27.3m / 20.3m |
| 방향 성분 | 북 −12.2m(남), 동 +7.5m |
| p90 / p95 / max | 44.6m / 64.1m / 526.3m |
| 거리 분포 | <50m **458**, <100m 31, <200m 8, <300m 2, 500~1000m 1 |

### 판정: 이 사이클의 전제가 실측으로 뒤집혔다

- **계통 오차는 ~150m가 아니라 ~20m다.** 사용자 육안 관측 크기의 1/7 수준이다.
- **일정 방향 편향이 아니다.** 방향 성분의 합성 크기(√(12.2²+7.5²) ≈ 14.3m)가 평균 거리(27.3m)보다 **작다**.
  계통 편향이라면 둘이 비슷해야 한다. 즉 오피넷 KATEC→WGS84 변환은 사실상 정확하고, 남은 차이는 무작위 산포다.
- 따라서 전량 실행해도 마커는 평균 20m 움직이며 **육안으로 체감되지 않는다** → **전량 실행 보류 권고**.
- 가드는 정상 작동한다(bbox·1.5km 초과 0건, max 526m 1건). 꼬리가 p95 64m로 매우 짧아 오매칭 유입이
  관측되지 않았으므로 **1.5km 임계를 좁힐 실익이 없다**(plan.md 리스크 항목 해소).
- **`noAddress` 47%** 는 예상보다 크다. 주소 없는 행이 절반이라 전량 순회해도 대상은 ~5,600곳뿐이다.

### 관측된 ~150m 오차의 유력한 원인 (후속 조사 대상)

좌표 데이터가 아니라 **마커 이미지의 anchor 지점**일 가능성이 크다. 핀 끝이 아니라 이미지 중앙이 좌표에
물리면 화면상 항상 같은 방향으로 밀리고, 이는 "일정 방향 오차"라는 관측과 정확히 일치한다(줌 레벨에 따라
미터 환산값이 달라진다). `lib/map/*Marker.ts`의 anchor/offset 설정을 먼저 확인할 것.

이 실측을 위해 응답 `offset`에 `p90M`/`p95M`/`maxM`/`histM`(거리 히스토그램)을 추가했다 —
평균·중앙값만으로는 꼬리값을 볼 수 없어 임계 조정 판단이 불가능했다.

---

## 미확인 항목 (환경 제약)

1. **좌표 회귀 검증(AC-3-2 실행 확증)**: "backfill 실행 → sync-opinet 1회 → 표본 좌표 불변"은 두 라우트를 프로덕션에서 순차 실행해야 확증된다. 이번 QA는 코드 레벨(배치 분리 + geom NOT NULL 근거)까지. 위 실측으로 전량 실행을 보류 권고하므로 당분간 확증 기회가 없다.
2. **브라우저 UI 실측**: 이 환경의 브라우저 확장이 앱 페이지에 스크립트를 주입하지 못한다(서버 3대·격리 페이지 모두 5s 타임아웃). 이 사이클은 UI 변경이 없어 영향 없음.

---

## 운영자 후속 작업

1. ~~**`0039` 적용**~~ — **완료(2026-08-17)**. 세 컬럼 존재를 REST 조회와 라우트 `columnsAvailable:true` 양쪽으로 확인했다.
2. ~~**dryRun 관측**~~ — **완료(2026-08-17)**. 결과는 위 "실측" 절.
3. **전량 실행: 보류 권고.** 실측상 개선폭이 ~20m라 육안 효과가 없고, `noAddress` 47%라 대상도 절반뿐이다.
   그래도 실행하려면 `?limit=500`(dryRun 없이)을 `cursor.wrapped=true` 까지 반복(약 22회, 카카오 호출 ~5,600건).
   라우트는 완성·검증된 상태라 언제든 실행 가능하다.
4. **우선 조사: 마커 anchor.** `lib/map/*Marker.ts`의 anchor/offset 설정이 핀 끝을 좌표에 물리는지 확인한다.
   관측된 "일정 방향 ~150m"의 유력 원인이며, 좌표 backfill보다 비용이 훨씬 작다.
5. **회귀 확인(3을 실행한 경우에만)**: 다음 `sync-opinet` 응답의 `coordPreserved`와 표본 좌표 불변 확인.
