# QA 리포트: 장소 리뷰(주유소/EV/세차장) — 전수 검증 + 운영자 적용 안내

> QA 수행: 2026-08-19 · 대상 브랜치: `feat/place-reviews` · 대상 DB: 이 프로젝트의 실제 운영 Supabase(현재 `0040`/`0041` 미완료 상태, 아래 "실제 마이그레이션 상태" 참고) · 기준: `.superpowers/sdd/plan/task-8-brief.md`

## 판정: 통과

이 태스크가 증명해야 하는 핵심 한 가지 — **"코드가 마이그레이션보다 먼저 배포돼도 안전한가"** — 를 시뮬레이션이 아니라 **지금 이 프로젝트의 실제 운영 DB**(정확히 그 미완료 상태)에 대해 실제 라우트 핸들러 함수를 그대로 호출해 확인했다. 23개 어서션 전부 통과, 실쓰기 1건은 확인 후 삭제해 원상 복구했다. 5개 게이트 전부 무오류, `/regions` SSG 유지, 4로케일 렌더 확인 완료.

---

## 실제 마이그레이션 상태 (실측 — 추정 아님)

운영 Supabase에 서비스 롤 키로 직접 조회한 결과:

| 대상 | 상태 | 확인 방법 |
|---|---|---|
| `reviews.target_type` / `target_id` 컬럼 | **존재함** (`default 'gas'`) | `select target_type,target_id,station_id from reviews limit 3` — 정상 응답 |
| `place_review_stats` 뷰 | **존재함** | `select * from place_review_stats limit 1` — 정상 응답 |
| `reviews_user_target_unique` (user_id, target_type, target_id) 유니크 인덱스 | **없음** | `upsert(..., {onConflict:'user_id,target_type,target_id'})` → `42P10 no unique or exclusion constraint matching the ON CONFLICT specification` |
| `review_reports` 테이블 (0041) | **없음** | `select from review_reports` → `PGRST205 Could not find the table 'public.review_reports'` |

즉 `0040`은 컬럼·뷰까지는 이미 적용돼 있고 **유니크 인덱스만 빠진 상태**, `0041`은 **전혀 적용되지 않은 상태**다. 브리프가 예고한 "EV/세차장 쓰기가 `42P10`으로 실패한다"·"`review_reports`가 없다"는 조건과 정확히 일치하며, 아래 모든 검증은 이 실제 상태를 대상으로 수행했다.

---

## 1) 실 DB(미완료 마이그레이션 상태) 대상 핸들러 레벨 검증

**기법**: `mock-loader-realdb.mjs`(Node ESM loader)로 `next/server`(Response 셰임)·`next-auth`(세션)만 가짜로 바꿔치고, `@/lib/db/supabase`를 포함한 나머지 전부는 실제 프로젝트 소스 그대로 로드해 **실제 route 핸들러 함수**(`listPlaceReviews`/`createPlaceReview`/리뷰 신고 `POST`/관리자 `GET`)를 직접 호출했다. DB 연결은 `.env.local`의 실제 서비스 롤 키로, 진짜 운영 프로젝트에 붙는다.

**로더 함정과 수정(브리프가 경고한 바로 그 문제)**: 기존 `mock-loader-realdb.mjs`는 `@/lib/auth/options`를 **절대 specifier**로만 스텁했다. 그런데 `lib/auth/admin.ts`는 `from './options'`(상대 경로)로 그 모듈을 불러온다 — 상대 import는 스텁을 우회해 실제 `lib/auth/options.ts`가 로드됐고, 그 파일은 모듈 스코프에서 실제 카카오 OAuth 프로바이더를 즉시 구성하다가 이 plain Node 프로세스(OAuth 환경변수 없음)에서 곧바로 죽었다(`TypeError: KakaoProvider is not a function`). Task 7이 `mock-loader.mjs`에 적용한 것과 동일한 수정 — **절대 specifier뿐 아니라 resolve된 절대 파일 경로(확장자 제외)로도 매칭하는 `STUB_ABS` 맵**을 이 realdb 변형에도 추가해 상대 import를 가로채도록 고쳤다. 관리자 큐 검증(아래 5번)은 이 수정 이후에만 성공했다.

스크립트: `/private/tmp/.../scratchpad/verify-task8-realdb.mjs`, 실행: `node --experimental-loader mock-loader-realdb.mjs verify-task8-realdb.mjs`.

사용한 실제 픽스처: 주유소 `A0013150`, EV 충전소 `HM610012`, 세차장 `202632200000500110`, 실제 사용자 2명, 기존 주유소 리뷰 1건.

### 결과 (verbatim)

```
=== 1) GET listing status codes (real DB, un-migrated indexes/report table) ===
OK   gas GET -> 200
OK   gas GET has real reviews (non-empty, existing data)
OK   ev GET -> 200 (not 500)
OK   ev GET -> empty list
OK   carwash GET -> 200 (not 500)
OK   carwash GET -> empty list

=== 2) POST write: ev/carwash degrade gracefully (real 42P10 from missing index) ===
OK   ev POST -> 503 migration_required
OK   carwash POST -> 503 migration_required

=== 3) POST write: gas review create + list + delete (real write, cleaned up) ===
OK   gas POST -> 200 ok:true
OK   gas POST returned an id
OK   gas GET reflects the just-written review
OK   gas GET review content matches

=== 4) report route: real missing-table failure is graceful (500 JSON, not a throw/crash) ===
OK   report POST does not throw (route always returns a Response)
OK   report POST -> 500 (surfaced, not silently ok, not 200)
OK   report POST body is JSON with an error string (no raw stack trace leaked)
  actual error message field: "Could not find the table 'public.review_reports' in the schema cache"

=== 5) admin queue (GET /api/admin/reviews/reports) against real DB ===
OK   ADMIN_EMAILS has at least one entry
OK   admin queue GET -> 200 for admin session
OK   admin queue pending is [] (review_reports absent)
OK   admin queue reportsTableMissing === true
OK   admin queue hidden is an array (independent of review_reports)
OK   admin queue GET -> 404 for non-admin (existence not disclosed)

=== cleanup ===
OK   cleanup delete succeeded (no error)
OK   cleanup verified: probe row no longer present

23 passed, 0 failed
```

**이것이 증명하는 것:**
- 주유소 상세: 리뷰 조회(기존 데이터 그대로 보임)·작성(실제로 새 리뷰 생성 → 즉시 목록에 반영) 모두 **기존과 동일하게 동작**. 작성한 프로브 리뷰는 확인 직후 삭제하고 재조회로 완전히 사라졌음을 재확인했다(운영 데이터에 남은 것 없음).
- EV·세차장 상세: 조회는 **200 + 빈 목록**(500 아님). 작성 시도는 실제 `42P10`을 만나 **503 `migration_required`**로 깔끔하게 내려간다(500이나 크래시가 아니라 "아직 이용 불가"를 명시).
- 신고 버튼: `review_reports` 부재로 실패하지만 **throw 없이 항상 Response를 반환**하고, 500 바디는 PostgREST 원문 메시지 하나뿐(스택트레이스 노출 없음). 클라이언트(`ReportButton.tsx`)는 이 원문을 콘솔에만 남기고 사용자에게는 일반화된 안내(`review.report.failed`)만 보여준다 — 코드 확인 완료.
- `/admin/reviews`의 API(`GET /api/admin/reviews/reports`)는 실제 관리자 세션에서 200 + `{pending:[], hidden:[], reportsTableMissing:true}`를 반환하고, 비관리자는 404(존재 비노출).

### 실제 서버(프로덕션 빌드) curl로 재확인

핸들러 레벨 검증과 별개로, `npm run build && next start -p 3512`로 띄운 진짜 Next 서버에 curl로 동일 엔드포인트를 쳐서 상태 코드가 일치함을 재확인했다:

```
gas GET   /api/places/gas/A0013150/reviews             -> 200 (실 리뷰 데이터 포함)
ev GET    /api/places/ev/HM610012/reviews               -> 200 {"reviews":[],"stats":{"count":0,...}}
carwash GET /api/places/carwash/202632200000500110/reviews -> 200 {"reviews":[],"stats":{"count":0,...}}
GET  /admin/reviews (비로그인)                            -> 404
GET  /api/admin/reviews/reports (비로그인)                -> 404 {"error":"not found"}
```

---

## 2) 5개 게이트

```
$ npm run i18n:check
기준(ko) 키: 762개
✅ en: 완료 (762/762)
✅ zh: 완료 (762/762)
✅ ja: 완료 (762/762)
✅ 상수 ↔ ko.json 라벨 일치
✅ ICU 파싱: 4개 로케일 전체 유효

$ npm run i18n:scan
✅ (intl) 안에 하드코딩 한글 없음

$ npm run typecheck
(출력 없음 — clean)

$ npm run lint
✔ No ESLint warnings or errors

$ npm run build
✓ Compiled successfully
✓ Generating static pages (292/292)
```

5개 전부 exit 0, `i18n:scan` 0건.

---

## 3) `/regions` SSG 회귀 확인

```
$ npm run build 2>&1 | grep -E "^├ ● /regions"
├ ● /regions/[region]                        200 B          94.4 kB
├ ● /regions/[region]/[district]             200 B          94.4 kB
```

둘 다 `●`(SSG) 유지. 리뷰 라우트 추가가 이 정적 생성 경계에 영향을 주지 않았다.

---

## 4) 4로케일 렌더 확인

**방법**: `next start` 프로덕션 빌드를 헤드리스 브라우저(Chrome MCP)로 열고, `document.cookie = "NEXT_LOCALE=xx"` 설정 후 재내비게이션(서버가 요청 시점 쿠키로 로케일을 결정하므로 재요청이 필요 — 브리프가 언급한 CDP `Network.setCookie` 대신 페이지 컨텍스트에서 쿠키를 직접 세팅했다. `NEXT_LOCALE` 쿠키는 `httpOnly`가 아니어서 이 방식으로도 동일하게 서버가 인식함을 실측으로 확인했다)로 실제 DOM을 읽었다.

| 로케일 | 페이지 | 확인한 요소 | 결과 |
|---|---|---|---|
| en | `/station/A0013150`(실제 리뷰 있음) | 리뷰 헤딩 | `"Reviews"` |
| en | 〃 | 신고 버튼 `aria-label` | `"Report this review"` |
| en | 〃 | 신고 모달 `role="dialog"` `aria-label`/제목 | `"Report this review?"` |
| en | 〃 | 신고 사유 라디오 라벨 5개 | `Ads / spam / Abusive language / Not related to this place / False information / Other` |
| en | 〃 | 상세사유 `placeholder` | `"Details (optional, 200 characters)"` |
| en | 〃 | 모달 버튼 | `Cancel` / `Report` |
| en | 〃 | 실 리뷰 본문(DB 원본) | `"오마이갓"` 그대로 — **한국어 유지 확인**(의도된 동작) |
| zh | `/station/A0013150` | 신고 버튼 `aria-label` | `"举报这条评论"` |
| zh | 〃 | 모달 제목 | `"要举报这条评论吗？"` |
| zh | 〃 | `placeholder` | `"详细说明（可选，200字以内）"` |
| zh | 〃 | 사유 라벨 5개 | `广告·垃圾信息 / 辱骂·诽谤 / 与该地点无关的内容 / 虚假信息 / 其他` |
| zh | 〃 | 모달 버튼 | `取消` / `提交举报` |
| ja | `/carwash/202632200000500110`(리뷰 0건) | 리뷰 헤딩 | `"レビュー"` |
| ja | 〃 | 리뷰쓰기 버튼 | `"レビューを書く"` |
| ja | 〃 | 작성 폼 `placeholder` | `"ご利用の感想を簡単にお聞かせください（任意）"` |
| ko | (전체 4로케일의 기준값) | `i18n:check`가 en/zh/ja 762/762 키 완전성 + ICU 유효성을 이미 기계 검증 | ✅ |

**확인 범위**: `aria-label`(신고 버튼, 모달), `title`에 해당하는 모달 heading/role="dialog" aria-label, `placeholder`(신고 상세사유, 리뷰 작성 폼) 모두 실제 렌더된 DOM에서 텍스트를 직접 읽어 확인했다 — 소스 카탈로그만 본 것이 아니다. `review.*`/`review.report.*` 네임스페이스 전 키가 `ReviewSection`/`ReviewForm`/`ReportButton` 컴포넌트가 실제로 소비하는 키와 1:1 대응함을 컴포넌트 소스에서도 재확인했다.

**DB 원본 콘텐츠**: en 로케일에서도 기존 리뷰 본문("오마이갓")과 작성자 닉네임이 한국어 그대로 렌더됐다 — 요구사항대로 UI만 번역되고 DB 콘텐츠는 번역하지 않는다.

**환경 이슈 한 가지**: `next-intl`이 컴파일한 프로덕션 페이지가 Kakao Maps SDK를 포함해 무거운 지도 컴포넌트를 함께 로드하는데, Chrome 확장이 `document_idle`을 오래(45초+) 기다리다 타임아웃하는 탭이 간헐적으로 발생했다(새 탭에서 재시도하면 정상 로드됨 — 지도 SDK가 로컬 API 키 없이 재시도 루프를 도는 것으로 추정). 실제 콘텐츠 렌더에는 영향이 없었고(모든 위 항목을 결국 성공적으로 읽었다), 이는 이 QA 세션의 브라우저 자동화 환경 이슈이지 애플리케이션 결함이 아니다.

---

## 5) 미확인 항목과 사유

- **실제 관리자 계정으로 브라우저 로그인 후 `/admin/reviews` 화면 스크린샷**: 하지 않았다. `ADMIN_EMAILS`에 등록된 이메일은 프로젝트 소유자 본인 계정이고, 그 계정의 실제 OAuth 로그인 자격증명을 갖고 있지 않다 — 이를 우회해 세션을 위조하는 것은 검증 범위를 벗어난다고 판단했다(Task 7이 같은 이유로 같은 판단을 내렸다). 대신 위 1)·2)절에서 **실제 관리자 세션 조건을 만족하는 진짜 함수 호출**(가짜 세션 객체 + 실제 `isAdminEmail`/실제 DB)로 200/404 분기를 실측했고, `ReviewsAdminClient.tsx` 소스를 읽어 `reportsTableMissing`/`pending.length===0`/`hidden.length===0` 분기 밖에 `review_reports`를 직접 참조하는 코드가 없음을 확인했다 — 화면이 깨질 경로 자체가 없다.
- **`0040`/`0041` 완전 적용 후의 정상 동작(EV/세차장 실제 쓰기, 신고 접수→개인 숨김, 관리자 숨김/기각 액션)**: 이 태스크의 목적이 "미적용 상태에서 안전한가"이므로 의도적으로 검증하지 않았다. 그 경로들은 Task 2(EV/세차장 리뷰 CRUD)·Task 5(신고 접수·개인 숨김)·Task 7(모더레이션 액션)이 각각 스텁 하네스 34/10건 등으로 이미 검증했다(각 태스크 리포트 참고). 마이그레이션 적용 후 실운영 재확인은 아래 운영자 순서 3번 항목에서 운영자가 직접 하게 된다.

---

## 운영자 후속 작업 (반드시 이 순서대로)

### 1. 남은 SQL 적용 — `drop`이 먼저다

이 프로젝트 DB는 **이미 `0040`의 컬럼/뷰까지는 적용돼 있고 유니크 인덱스만 빠진 상태**다(위 "실제 마이그레이션 상태" 참고). 과거에 `0040`의 이전 초안(표현식 인덱스 버전)을 손으로 적용한 적이 있다면 `reviews_user_target_unique`라는 이름의 인덱스가 **다른 정의로** 이미 존재할 수 있다 — `create ... if not exists`는 **이름만** 보고 판단하므로 이 경우 새 정의가 조용히 무시된다. 그래서 `drop`을 먼저 실행한다:

```sql
drop index if exists reviews_user_target_unique;
create unique index if not exists reviews_user_target_unique
  on reviews (user_id, target_type, target_id);
```

그다음 `supabase/migrations/0041_review_reports.sql`의 전체 내용을 그대로 적용한다(`review_reports` 테이블 + 인덱스 3개 + RLS 비활성화).

적용 후: 주유소 리뷰 목록·작성이 여전히 그대로 보이는지(퇴행 없음), EV/세차장 리뷰 작성이 이제 성공하는지(더 이상 `42P10`/`503`이 아님) 확인한다.

### 2. PostgREST 스키마 캐시

적용 직후에도 API가 `review_reports`를 "없다"고 계속 응답하면, PostgREST가 스키마를 캐시하고 있는 것이다. Supabase SQL Editor에서:

```sql
NOTIFY pgrst, 'reload schema';
```

### 3. 관리자 접근 확인

`ADMIN_EMAILS` 환경변수에 운영자 본인 로그인 이메일이 들어있는지 확인한 뒤, 그 계정으로 로그인해 `/admin/reviews`가 정상 로드되는지 확인한다. 미설정 시 `/admin/reviews`는 항상 404(존재 비노출)다.

### 4. 신고는 자동으로 숨겨지지 않는다 — 운영자가 계속 확인해야 한다

**이 설계의 핵심 트레이드오프를 명확히 알아야 한다**: 신고가 접수돼도 **전역 자동 숨김은 없다**. 신고자 본인에게만 그 리뷰가 즉시 숨겨질 뿐, 다른 모든 사용자에게는 **운영자가 `/admin/reviews`에서 직접 "숨김" 처리하기 전까지 계속 노출된다.** 이 앱은 리뷰가 업주(가격·품질 평가) 이해관계와 직결돼 조직적 허위 신고로 정상 리뷰를 내리려는 유인이 있고, 억울하게 숨겨진 작성자에게는 항의 창구가 없어 자동 숨김을 의도적으로 넣지 않았다 — 그 대가로 **대기열을 사람이 주기적으로 확인해야만 이 기능이 실제로 작동한다.**

운영자가 정할 것: 얼마나 자주 `/admin/reviews`를 확인할지 주기를 정한다. 그 주기가 너무 길어져 부적절한 리뷰가 오래 노출된다고 판단되면, 다음 수단은 **새 인프라를 만들 필요 없이** 붙일 수 있다 — 이 코드베이스에는 웹푸시가 이미 구축돼 있으므로(`app/api/push/subscribe`), 신고 접수 시 운영자에게 푸시 알림을 보내는 것이 자연스러운 다음 단계다.

---

## 부록: 사용한 검증 자산

- `mock-loader-realdb.mjs` (수정본 — `STUB_ABS`로 상대 import 가로채기 추가), `verify-task8-realdb.mjs`: `/private/tmp/.../scratchpad/`(프로젝트에는 커밋하지 않음, 재현 절차는 위 1)절에 기술).
- 게이트 로그: `npm run build` 전체 출력.
