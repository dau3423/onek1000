# QA 리포트: 성장 계기판 구축 + 잠자는 크론 가동 준비

> QA: qa-tester 에이전트 · 2026-08-15
> 기준: `docs/improvements/2026-08-14-growth-acquisition-retention/plan.md` (FR-1/2/3)
> 변경 범위: 작업 트리 uncommitted 28파일 (신규 2 + 수정 26). 리뷰는 사전 통과.

## 판정: 통과

정적 검증 3종 무오류 + 검증 가능한 모든 AC 시나리오 성공. 최우선 항목인 FR-3 보안(빈 시크릿 우회 차단)은 실제 dev 서버에 curl로 확인해 **전부 차단(401/403)** 됨을 실증했다.
브라우저로 직접 렌더 확인이 불가한 두 지점(`/admin` 카드 — ADMIN_EMAILS 게이트, 주유소 상세 렌더 — Mock에 상세 데이터 없음)은 정적/코드 + 엔드포인트 검증으로 갈음했으며, 어느 것도 AC 실패가 아니다(환경 제약). 아래에 무엇을 무엇으로 검증했는지 전부 명시한다.

---

## 정적 검증

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ 통과 (오류 0) |
| `npm run lint` (next lint) | ✅ 통과 ("No ESLint warnings or errors") |
| `npm run build` (next build) | ✅ 통과 (전 라우트 컴파일 성공) |

---

## 시나리오 결과

### FR-3 잠자는 크론 방어 로직 (최우선 — 실서버 curl)
Mock dev 서버(`env -u CRON_SECRET NEXT_PUBLIC_USE_MOCK=true`, CRON_SECRET 미설정)로 실증.
`.env.local`에 CRON_SECRET 없음(`grep -c` = 0)을 먼저 확인 → 빈 시크릿 상태가 유효.

| AC | 절차 → 기대 → 실제 | 판정 |
|---|---|---|
| FR-3 AC1 | `POST /api/internal/weekly-digest` + `Authorization: Bearer undefined` → 401/403 → **403** | ✅ |
| FR-3 AC1(보강) | 같은 라우트 `Bearer ` (빈값) → 차단 → **403** | ✅ |
| FR-3 AC1(보강) | 같은 라우트 헤더 없음 → 차단 → **403** | ✅ |
| FR-3 스팟 | `sync-opinet` `Bearer undefined` → 차단 → **403** | ✅ |
| FR-3 스팟 | `forecast-notify` `Bearer undefined` → 차단 → **403** | ✅ |
| FR-3 스팟 | `billing/charge-cron` `Bearer undefined` → 차단 → **403** | ✅ |
| FR-3 스팟 | `daily-top10` `Bearer undefined` (GET) → 차단 → **401** | ✅ |
| FR-3 스팟 | `daily-top10?secret=` (빈 쿼리) → 차단 → **401** | ✅ |
| FR-3 AC2 | 올바른 `Bearer testsecret`로 `weekly-digest`(별도 서버 CRON_SECRET=testsecret) → graceful skip → **`{skipped:true, reason:"mock mode or missing config"}` (200)** | ✅ |
| FR-3 AC3 | 올바른 시크릿으로 `post-daily-tweet` → X 미설정 skip + preview → **`{posted:false, reason:"X not configured", preview:[3건]}` (200)** | ✅ |
| FR-3 회귀 | `post-daily-tweet` 잘못된 시크릿 → 차단 → **401** | ✅ |
| FR-3 AC4 | `docs/06` §7에 잡 2개(post-daily-tweet 30 7 * * *, weekly-digest 0 7 * * 1) 기존 6개와 동일 형식 존재 | ✅ (육안) |
| FR-3 AC5 | `.env.example`에 X env 4종(API_KEY/SECRET/ACCESS_TOKEN/ACCESS_SECRET) 주석과 함께 존재 + 정적 3종 통과 | ✅ |

코드 확인: 모든 internal 라우트가 `const secret = process.env.CRON_SECRET ?? ''; if (secret.length === 0 || auth !== \`Bearer ${secret}\`)` 패턴(daily-top10은 `secret.length > 0 && (...)`)으로 통일 보강됨. `Bearer undefined` 우회 결함 제거 확인.

### FR-1 핵심 행동 이벤트 계측
| AC | 절차 → 기대 → 실제 | 판정 |
|---|---|---|
| FR-1 AC4 | `POST /api/event` 화이트리스트 밖 이벤트(`totally_bogus_event`) → 200 + 미기록 → **`{ok:true}` (200)** | ✅ |
| FR-1 AC5 | Mock에서 `station_detail_view`/`navi_click` POST → 200 + 콘솔/서버 에러 없음 → **둘 다 `{ok:true}` (200), dev 로그 에러 0** | ✅ |
| FR-1 AC6 | props에 좌표/주소/검색어 미포함, `stationId`(공개 오피넷 ID)까지만 | ✅ (코드) |
| FR-1 AC1~3 | 6종 훅이 올바른 지점·props로 심겼는지 | ✅ (코드) / ⚠️ 브라우저 실발화는 미확인 (아래 명시) |

코드 확인:
- 화이트리스트 6종 추가(`station_detail_view`, `navi_click`, `forecast_view`, `route_search`, `fuel_log_saved`, `pwa_install`), 그 이상 없음.
- `StationViewTracker`(신규): 상세 마운트 시 `track('station_detail_view', {stationId})` — 열 때마다 1건, dedupe 없음(AC1 부합).
- `NaviButton`: `stationId` 있으면 `track('navi_click', {stationId})` **후** 이동. 전송 실패가 이동을 막지 않음(fire-and-forget, AC2 부합). 상세/EV 페이지 모두 `stationId` 주입.
- `ForecastCard`: 접힘→펼침 순간에만 `track('forecast_view', {direction})` (StrictMode 이중발화 방지 위해 setState 밖 판정).
- `route/page.tsx`: 검색 실행 시 `track('route_search')` props 없음.
- `FuelLogButton`: 저장 성공 응답 후 `track('fuel_log_saved')` props 없음.
- `InstallBanner`/`InstallButton`: 네이티브 프롬프트 결과 accepted/dismissed만 `track('pwa_install', {outcome})`, unsupported 제외.
- `lib/analytics.ts track()`: sendBeacon 우선 + keepalive fetch 폴백, 전부 try/catch — UX 비파괴.

### FR-2 유입 채널 + D1/D7 대시보드
| AC | 절차 → 기대 → 실제 | 판정 |
|---|---|---|
| FR-2 AC5 | Mock에서 `/api/visit` utm 포함 POST → 200 no-op → **`{ok:true}` (200), 에러 0** | ✅ |
| FR-2 AC6 | 마이그레이션 0034 멱등(`add column if not exists`/`create index if not exists`/`create or replace function`) | ✅ (육안) |
| FR-2 AC1/AC2 | first-touch utm 저장 + referrer 호스트만 | ✅ (코드) |
| FR-2 AC3/AC4 | `/admin` 카드 렌더 + 실패 시 '-' 폴백 | ✅ (코드) / ⚠️ 브라우저 렌더 미확인 (admin 게이트, 아래 명시) |
| FR-2 AC7 | 비관리자/비로그인 `/admin` notFound | ✅ (기존 `getAdminOrNull` 게이트 미변경) |

코드/SQL 확인:
- 0034: `page_visits`에 `ref_host`/`utm_source`/`utm_medium`/`utm_campaign` 4컬럼(nullable) + `(device_id, visit_date)` 인덱스 + `retention_d1(days)`/`retention_d7(weeks)`/`visit_channels(d)` RPC 3종.
- D1 RPC sanity: 기준일 ∈ [today-days, today-1], 익일(+1) 존재 여부 filter, per-day 재방문율 평균 → round(_,1) 백분율, 데이터부족 시 NULL. D7은 +7, 기준일 window [today-(7+weeks*7-1), today-7]. 정의가 plan과 일치.
- `visit_channels`: `coalesce(nullif(utm_source,''), nullif(ref_host,''), '직접')` 채널화, visits desc 정렬 — plan의 "utm_source > ref_host > 직접" 우선순위 부합.
- `recordVisit`: 채널 컬럼 포함 upsert 실패(0034 미적용 창) 시 3필드 fallback upsert로 **방문 유실 방지**. `ignoreDuplicates`로 first-touch만 남김(AC1 부합).
- `VisitPing.readRefHost`: `new URL(ref).hostname` 호스트만 추출, `www.` 제거, 동일 도메인은 null(직접) — 경로/쿼리 미포함(AC2 부합).
- `getRetentionD1/D7`: numeric 문자열 `Number()` 보정 + `Number.isFinite` 가드, 실패/null → null → '-'.
- `admin/page.tsx`: Mock/미설정 분기에서 신규 4카드(D1/D7/채널TOP3/행동) 전부 `value:'-'` 폴백. 정상 경로도 `getRetention*`/`getTodayChannels` null → '-'. `Promise.all`에 신규 3함수 추가, 각 함수 독립 try/catch라 1개 실패가 페이지를 깨지 않음(AC3/AC4 부합). 긴 텍스트 카드는 `text-sm break-words`로 가독성 처리, hint 보조설명 추가.

### 일반 화면 회귀 (브라우저 — Chrome 자동화)
| 화면 | 결과 | 판정 |
|---|---|---|
| 홈 `/` | 정상 렌더(헤더·유종탭 휘발유/경유/LPG/EV·브랜드·PWA 설치배너·지도영역·하단시트 "이 지역 최저가 TOP 0"). 지도는 "NEXT_PUBLIC_KAKAO_MAP_KEY missing"로 graceful 안내(Mock 기대 동작). 콘솔 에러 0. | ✅ |
| 주유소 상세 `/station/A0010001` | Mock에 상세 데이터 없어 graceful "주유소 정보를 찾을 수 없습니다" 안내 화면(스타일 정상, notFound 경로). 콘솔 에러 0. | ✅ (프레임워크 정상) |

---

## 콘솔 에러
없음. 홈/상세 모두 `read_console_messages`(onlyErrors) 결과 "No console errors". dev 서버 로그에도 `⨯`/error/exception 없음. `/api/event`·`/api/visit` POST 전부 200.

## 모바일·다크모드 확인 결과
- 모바일: 앱은 mobile-first(`max-w-md` 중앙정렬, 홈은 풀블리드 지도) 구조. 뷰포트 390px 리사이즈 시도했으나 스크린샷 캡처 뷰포트가 좁은 폭으로 리플로우되지 않아 시각 확증은 제한적. 레이아웃 붕괴 징후는 없음(구조상 반응형). — **부분 확인**
- 다크모드: 이번 변경의 사용자 화면 UI 신규 요소는 사실상 없음(FR-1은 track 호출만, FR-2 카드는 관리자 전용). 관리자 카드는 기존 라이트 팔레트(`bg-white`/`text-gray-*`) 패턴을 그대로 따름(다크 전용 스타일 없음 — 기존 admin 패턴 유지). 홈은 기존 다크 지도 배경 유지. — 신규 다크모드 리스크 없음.

---

## 발견 문제 상세
없음. AC 실패 0건.

---

## 미해결 / 리스크 (판정 무관 — 참고용)
1. **브라우저 미확증 2건(환경 제약, AC 실패 아님)**:
   - `/admin` 신규 카드(D1/D7/채널TOP3/행동)의 실제 렌더는 ADMIN_EMAILS 로그인 게이트로 브라우저 확인 불가 → 코드 경로(Mock/실패 시 전 카드 '-', 페이지 비파괴)로 갈음.
   - `station_detail_view` sendBeacon의 네트워크 탭 실발화(FR-1 AC1)와 상세 화면 렌더는 Mock에 상세 데이터가 없어(상세 API null → notFound) 브라우저에서 재현 불가 → `StationViewTracker` 코드 + `/api/event` 200 실증으로 갈음. 실데이터/Supabase 연결 환경에서 재확인 권장.
2. **테스트 셋업 자국(정리 완료)**: QA 중 포트 3000/3001에 dev 서버를 동시 기동해 공유 `.next` 매니페스트가 일시 손상(정적 청크 404·무스타일)되었음. 이는 제품 결함이 아니라 QA 셋업 실수. 3001 종료 + `.next` 삭제 후 클린 재기동하여 정상 렌더 재확인함. 코드/빌드에는 영향 없음(별도 `npm run build`는 독립 통과).
3. **D1/D7 소급 실측 미확인**: Mock에는 page_visits 히스토리가 없어 RPC 실제 산출값은 확인 불가. RPC 정의 sanity + graceful '-' 폴백만 검증. 배포 후 실데이터에서 육안 확인 필요(plan 성공지표 항목).
4. **크론 실가동은 범위 밖**: Cloud Scheduler 잡 등록·X env 프로덕션 주입은 운영 제안(코드 밖). 본 사이클은 방어 로직 + 문서 + env 예시까지만 — 전부 확인됨.
5. (기존/범위 밖) Kakao 지도 키는 로컬 Mock에 없어 지도 렌더는 확인 대상 아님(graceful 안내 정상).
