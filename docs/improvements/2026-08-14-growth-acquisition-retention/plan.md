# 기획서: 성장 정체 돌파 1차 — 성장 계기판 구축 + 잠자는 크론 가동 준비

> 작성: 2026-08-14, product-planner 에이전트
> 근거: `docs/improvements/2026-08-14-growth-acquisition-retention/research.md`
> 기준 문서: `docs/요구사항_명세서.md` (SRS)

---

## 배경·목표

research.md의 결론은 명확하다. DAU 150 정체의 1차 병목은 "성장 시도가 부족한 것"이 아니라 **성장 시도의 성패를 판정할 계기판이 없는 것**이다.

- 계측된 이벤트는 가입 퍼널 6종뿐이다(`app/api/event/route.ts:28-35`). 지도 탐색·상세 진입·길찾기·예측 열람 등 **핵심 가치 행동은 아무것도 계측되지 않는다**.
- 리텐션 지표는 "다른 날 2회 이상 방문한 로그인 사용자 누적 수" 단일 숫자뿐(`lib/db/stats.ts:86-95`, `supabase/migrations/0033`). D1/D7 코호트가 없어 "이번 주 개선이 리텐션을 올렸는가"에 답할 수 없다.
- `page_visits`에 referrer/UTM 컬럼이 없어(마이그레이션 0029 확인) "SEO 랜딩이 유입을 만드는가"를 자체 데이터로 검증 불가.
- 한편, 유입·재방문 훅으로 **이미 구현 완료된** 데일리 트윗(`app/api/internal/post-daily-tweet/route.ts`)과 주간 다이제스트(`app/api/internal/weekly-digest/route.ts`)가 Cloud Scheduler 미등록 추정으로 잠자고 있다(`docs/06_배포_firebase.md` §7 잡 6개 목록에 부재).

이번 사이클은 research.md 추천 우선순위 1위(B1 계측 확장)를 FR의 중심에 두고, 2위(A1+B2 크론 가동) 중 **코드로 가능한 부분**(문서화·env 예시·크론 라우트 방어 로직 보강)을 함께 처리한다.

**이번 사이클이 끝나면 얻는 것(1문장)**: 운영자가 관리자 대시보드에서 D1/D7 재방문율·유입 채널·핵심 행동 지표를 매일 확인할 수 있게 되고, 데일리 트윗·주간 다이제스트 크론은 "콘솔에서 명령 한 번"이면 켤 수 있는 상태가 된다.

---

## 유저 스토리

- **운영자로서**, 오늘 방문자가 어디서 왔고(직접/구글/네이버/소셜) 어제 온 사람이 오늘 다시 왔는지(D1) 보고 싶다. 그래서 SEO·SNS·공유 등 다음 성장 실험의 효과를 데이터로 판정할 수 있다.
- **운영자로서**, 사용자가 상세 진입·길찾기·예측 열람·주유 기록 같은 핵심 행동을 실제로 하는지 보고 싶다. 그래서 어떤 기능이 재방문을 만드는지 알고 리소스를 집중할 수 있다.
- **운영자로서**, 이미 만들어 둔 데일리 트윗·주간 다이제스트를 안전하게 켜는 절차가 문서에 있으면 좋겠다. 그래서 콘솔 접근이 가능해지는 즉시 개발 없이 가동할 수 있다.
- (간접) **운전자 사용자로서**, 내 행동이 무작위 디바이스 ID 이상으로 식별되지 않기를 바란다. 그래서 안심하고 서비스를 쓸 수 있다.

---

## 기능 요구사항

### FR-1: 핵심 행동 이벤트 계측 확장 (성장 계기판 1/2)

- **우선순위**: P0
- **화면 변경**: 無 (사용자에게 보이는 UI 변화 없음 — 기존 화면에 `track()` 호출만 추가) → ux-designer 불필요
- **설명**: `funnel_events` 화이트리스트를 가입 퍼널 6종에서 핵심 가치 행동 6종을 더해 확장하고, 해당 행동이 일어나는 클라이언트 지점에 기존 `track()`(`lib/analytics.ts`) 호출을 심는다. 기존 fire-and-forget·rate limit·graceful 실패 패턴을 그대로 따른다(분석이 UX를 깨지 않는다).
- **추가 이벤트(6종, 이 이상 추가 금지)**:
  | 이벤트 | 시점 | props | 훅 위치(예상) |
  |---|---|---|---|
  | `station_detail_view` | 주유소 상세 시트/화면 열림 | `{ stationId }` | 상세를 여는 컴포넌트(`components/ui/BottomSheet.tsx` 호출부 또는 상세 컨테이너 — 구현 시 실제 열림 지점 1곳으로 확정) |
  | `navi_click` | 길찾기 CTA 클릭 | `{ stationId }` | `components/station/NaviButton.tsx` |
  | `forecast_view` | 주유 타이밍 예측 카드 열람(펼침/클릭) | `{ direction? }` | `components/forecast/ForecastCard.tsx` 또는 `ForecastMiniCard.tsx` |
  | `route_search` | 경로 최저가 검색 실행 | 없음 | `app/route/` 검색 실행 핸들러 |
  | `fuel_log_saved` | 주유 기록 저장 성공 | 없음 | `components/station/FuelLogButton.tsx`(저장 성공 콜백) |
  | `pwa_install` | 설치 프롬프트 결과 | `{ outcome: 'accepted' \| 'dismissed' }` | `components/pwa/InstallBanner.tsx`, `InstallButton.tsx` |
- **구현 위치**: `app/api/event/route.ts`(ALLOWED_EVENTS 확장), 위 표의 컴포넌트들, 필요 시 `lib/analytics.ts`(변경 없이 재사용이 원칙)
- **수용 기준(AC)**:
  1. 지도에서 주유소 마커를 탭해 상세가 열리면, 브라우저 네트워크 탭에서 `/api/event`로 `station_detail_view` POST(sendBeacon)가 1건 관찰된다. 같은 상세를 다시 열면 다시 1건 전송된다(세션 내 dedupe는 요구하지 않음).
  2. 길찾기 버튼 탭 시 `navi_click`이 전송되고, 외부 길찾기 이동은 기존과 동일하게 동작한다(이벤트 전송 실패·차단 시에도 이동이 지연/실패하지 않는다).
  3. 나머지 4종도 각 트리거 시점에 전송이 관찰된다.
  4. 화이트리스트 밖 이벤트는 기존대로 기록되지 않고 200 응답한다(회귀 없음).
  5. **Mock 모드**(`NEXT_PUBLIC_USE_MOCK=true`, Supabase 키 없음): 이벤트 전송 시 서버가 200을 반환하고 콘솔 에러가 발생하지 않는다(`recordEvent`의 기존 no-op 경로 활용).
  6. props에 좌표·주소·검색어 등 위치/개인정보성 값을 넣지 않는다. `stationId`(공개 오피넷 ID)까지만 허용.
- **In**: 화이트리스트 확장, 훅 6곳, 관리자 대시보드 "오늘 행동 이벤트" 집계 표시는 FR-2의 카드에 편승(기존 `funnel_counts` RPC가 이벤트별 집계를 이미 반환하므로 추가 RPC 불필요)
- **Out**: `share_click`(공유 버튼 자체가 없음 — A4와 함께 다음 사이클), GA4 이벤트 병행 전송, 세션 단위 dedupe

### FR-2: 유입 채널 기록 + D1/D7 코호트 리텐션 대시보드 (성장 계기판 2/2)

- **우선순위**: P0
- **화면 변경**: 有 — 단, **관리자 전용 내부 화면**(`/admin`, ADMIN_EMAILS 게이트 + noindex)에 통계 카드 추가만. 기존 카드 그리드 패턴 재사용이므로 ux-designer 없이 진행 가능하다고 판단(PM 확인 요망)
- **설명**: 3부 구성.
  1. **유입 채널 기록**: `page_visits`에 `ref_host`(referrer의 호스트만), `utm_source`/`utm_medium`/`utm_campaign` 컬럼 추가(마이그레이션 0034). `components/VisitPing.tsx`가 `document.referrer`(호스트만 추출)와 URL의 utm 3종을 `/api/visit` body로 전송하고, `app/api/visit/route.ts` → `lib/db/stats.ts` `recordVisit`이 저장한다. 기존 `(visit_date, device_id)` upsert의 `ignoreDuplicates` 특성상 **하루 첫 방문의 채널만 남는다**(first-touch — 의도된 동작으로 명시).
  2. **D1/D7 코호트 RPC**: `visit_date × device_id` 원천으로 디바이스 기준 리텐션 RPC 2개 추가(마이그레이션 0034에 동봉). 정의는 다음과 같이 고정한다:
     - **D1**: 기준일에 방문한 고유 디바이스 중 익일에도 방문한 비율. 대시보드에는 "최근 7일 평균 D1" 표시.
     - **D7**: 기준일 방문 디바이스 중 7일 후(±0일, 정확히 7일 뒤)에 방문한 비율. 대시보드에는 "최근 4주 평균 D7" 표시.
     - 기존 데이터로 **소급 산출**된다(research.md §2 확인 — 추가 수집 대기 불필요).
  3. **대시보드 카드**: `app/admin/page.tsx` 통계 그리드에 카드 추가 — `[리텐션] D1(최근 7일)`, `[리텐션] D7(최근 4주)`, `[유입] 오늘 채널 TOP3`(예: "직접 92 · google 31 · naver 12"), `[행동] 오늘 상세 진입/길찾기`(FR-1 이벤트를 기존 `funnel_counts`로 집계). 조회 함수는 `lib/db/stats.ts`에 추가하고 실패 시 '-' 폴백(기존 패턴).
- **구현 위치**: `supabase/migrations/0034_*.sql`(신규), `lib/db/stats.ts`, `app/api/visit/route.ts`, `components/VisitPing.tsx`, `app/admin/page.tsx`
- **수용 기준(AC)**:
  1. `?utm_source=test&utm_medium=qa`를 붙여 접속(당일 첫 방문 디바이스)하면 `page_visits` 해당 행에 `utm_source='test'`가 저장된다. 같은 날 두 번째 방문의 다른 utm은 덮어쓰지 않는다.
  2. referrer는 **호스트만** 저장된다(경로·쿼리 미포함). referrer 없으면 null(직접 유입).
  3. `/admin` 접속 시 D1·D7·채널 TOP3·행동 카드가 5초 내 렌더되고, 값이 산출 불가한 구간(데이터 부족)은 '-'로 표시된다. 배포 직후에도 D1/D7은 기존 누적 데이터로 소급 계산된 값이 보인다.
  4. RPC 미적용/조회 실패 시에도 `/admin` 페이지는 깨지지 않고 해당 카드만 '-'다(기존 graceful 패턴 회귀 없음).
  5. **Mock 모드**: `/admin`이 기존처럼 전 카드 '-'로 정상 렌더되고, 방문 ping은 오류 없이 no-op이다.
  6. 마이그레이션은 멱등(`if not exists`/`create or replace`)으로 작성되어 재적용이 안전하다(0033 패턴).
  7. 비관리자/비로그인의 `/admin` 접근은 기존대로 notFound다.
- **In**: 컬럼 4개, RPC 2개(+채널 집계 쿼리 1개), VisitPing/visit 라우트 확장, 관리자 카드 4~5개
- **Out**: 일자별 추이 차트/그래프 UI(숫자 카드만), GA4·서치콘솔 데이터 연동, referrer 전체 URL 저장(개인정보 최소수집 위반 소지), 코호트 조건 커스터마이즈 UI

### FR-3: 잠자는 크론 2종 가동 준비 — 방어 로직 보강 + 등록 절차 문서화

- **우선순위**: P1
- **화면 변경**: 無 → ux-designer 불필요
- **설명**: 크론 실가동(Cloud Scheduler 등록·X env 주입)은 프로덕션 콘솔 작업이라 운영 제안으로 분리하고(아래 §운영 제안 1), 이번 FR은 **코드·문서로 가능한 준비**만 담는다.
  1. **방어 로직 보강**: `app/api/internal/weekly-digest/route.ts:36-39`는 `auth !== \`Bearer ${process.env.CRON_SECRET}\`` 비교만 있어 **CRON_SECRET 미설정 시 `Authorization: Bearer undefined` 문자열로 통과 가능**한 결함이 있다(확인됨). `post-daily-tweet/route.ts:26-31`의 [W1] 빈 시크릿 가드(미설정 시 무조건 401)와 동일 패턴으로 보강한다. 다른 `/api/internal/*` 라우트에도 같은 결함이 있는지 점검하고 발견 시 동일 보강한다(SEC-2 준수).
  2. **문서화**: `docs/06_배포_firebase.md` §7에 잡 2개 등록 명령을 기존 6개와 동일 형식으로 추가 — `post-daily-tweet`(제안: 매일 07:30 KST — 어제자 데이터 확정 + 출근 시간대), `weekly-digest`(제안: 매주 월 07:00 KST, `maxDuration=300` 감안 `--attempt-deadline=300s`).
  3. **env 예시**: `.env.example`에 X env 4종(`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`)을 주석(용도·미설정 시 skip 동작 설명)과 함께 추가(현재 부재 확인).
- **구현 위치**: `app/api/internal/weekly-digest/route.ts`(+점검 결과에 따라 `/api/internal/*` 일부), `docs/06_배포_firebase.md`, `.env.example`
- **수용 기준(AC)**:
  1. CRON_SECRET을 비운 로컬 환경에서 `Authorization: Bearer undefined`로 `/api/internal/weekly-digest` POST 시 401/403이 반환된다(현재는 통과 — 수정 후 차단 확인).
  2. 올바른 `Bearer ${CRON_SECRET}`로 호출 시 기존 동작(Mock/미설정 환경에서는 `{ skipped: true, ... }` graceful skip)이 유지된다.
  3. Mock 모드에서 `post-daily-tweet`를 올바른 시크릿으로 호출하면 X 미설정 skip 응답(`reason: 'X not configured'` + preview)이 기존대로 반환된다(회귀 없음).
  4. `docs/06` §7에 잡 2개의 `gcloud scheduler jobs create` 명령이 기존 6개와 같은 형식(project/location/schedule/timezone/uri/headers/deadline)으로 존재한다.
  5. `.env.example`에 X env 4종이 존재하고, `npm run typecheck`/`lint`/`build`가 통과한다.
- **In**: 빈 시크릿 가드, 문서 §7 갱신, env 예시
- **Out**: 실제 Cloud Scheduler 잡 생성·X 계정 개설·env 프로덕션 주입(운영 제안), 트윗 콘텐츠/발송 로직 변경, weekly-digest 멱등키 추가(재실행 중복 발송 방지 — 다음 사이클 후보로 기록)

---

## 범위

### 포함 (In)
- FR-1: 핵심 행동 이벤트 6종 계측(화이트리스트 + 훅)
- FR-2: 유입 채널(ref_host + utm 3종) 기록, D1/D7 코호트 RPC, 관리자 대시보드 카드
- FR-3: weekly-digest 빈 시크릿 가드(+internal 라우트 점검), 크론 2종 등록 문서화, X env 예시

### 제외 (Out — 다음 사이클 후보, PM이 BACKLOG로 이관)
| 후보 | 근거(research.md) | 미루는 이유 |
|---|---|---|
| A4 공유 루프(상세/TOP10 공유 버튼 + 주유소별 동적 OG) | 우선순위 3위 | 사용자 화면 변경 — ux-designer 디자인 필요. 계기판이 먼저 있어야 공유 효과도 측정 가능(`share_click` 이벤트는 그때 화이트리스트에 추가) |
| B3 푸시 옵트인 관문 완화(비로그인 개방) | 우선순위 4위 | 구독 API·발송 대상 쿼리 구조 변경 — 규모 초과. BETA_FREE 종료 계획과 함께 설계 필요(research 미해결 5) |
| B4 PWA 설치 배너 재노출 정책 | 우선순위 4위 | 이번 사이클의 `pwa_install` 계측으로 현 설치·거절율을 먼저 확보한 뒤 정책 결정 |
| A3 시군구 URL 슬러그화(301) | 우선순위 5위 | SEO 장기 효과·즉효성 낮음, 211페이지 리다이렉트 검증 비용 큼 |
| A5 레퍼럴 보상 재설계 / B5 주유로또 / B6 가격 제보 / B7 할인카드 실질가 | 후보 목록 | 보상 설계·경품 규정·데이터 소스 등 선결 조건 미해결 |
| weekly-digest 멱등키(재실행 중복 발송 방지) | FR-3 점검 파생 | 크론 실가동 결정 후 함께 처리 |

---

## 운영 제안 (코드 밖 — FR 아님, 운영자 액션)

1. **크론 실태 확인 + 잡 2개 등록** (research 미해결 1 해소): `gcloud scheduler jobs list --location=asia-northeast3 --project=onek1000`으로 현행 잡을 확정하고, FR-3에서 문서화된 명령으로 `post-daily-tweet`·`weekly-digest`를 등록한다. X 개발자 계정 발급 + env 4종 프로덕션 주입 선행. 주의: Cloud Scheduler 무료는 3잡까지(현재 6잡 초과분 과금 확인), X API 무료 티어 월 발행 한도 확인(research 미해결 4).
2. **네이버 블로그 채널 개설·정기 발행 (A2)**: `docs/오늘의_전국최저가_TOP10.md` 템플릿 + `/admin/daily-top10` 생성물로 주 2~3회 발행, 본문에 `/regions/*` 링크 + **utm 파라미터**(`?utm_source=naver_blog&utm_medium=social`)를 붙인다 — FR-2 배포 후엔 이 채널의 유입이 대시보드에 잡힌다.
3. **GA4·서치콘솔 실적 열람** (research 미해결 2): 현 DAU 150의 채널 분포 기초선을 콘솔에서 1회 확보해 FR-2 자체 데이터와 교차 검증한다.
4. **개인정보처리방침 갱신 검토**: 유입 채널(referrer 호스트·utm) 수집 추가에 대해 방침 문구 필요 여부를 확인한다(§리스크 참조).

---

## 성공 지표 (사이클 종료 후 확인)

| 지표 | 목표 | 측정 방법 |
|---|---|---|
| 성장 계기판 가동 | `/admin`에서 D1·D7·채널 TOP3·행동 지표가 실데이터로 표시 | 배포 익일 `/admin` 육안 확인(D1/D7은 소급 산출로 배포 당일부터) |
| 리텐션 기초선 확보 | 디바이스 D1·D7 수치 최초 확보(목표치 없음 — 기초선 자체가 산출물) | 대시보드 카드 값 기록 → 다음 사이클 개선의 비교 기준 |
| 유입 채널 분해 | 일 방문의 직접/검색/소셜 비중 최초 확보 | 채널 TOP3 카드 + `page_visits.ref_host` 집계 |
| 핵심 행동 관측 | 6종 이벤트가 하루 1건 이상씩 수집됨(수집 파이프 정상 확인) | `funnel_counts` RPC / 대시보드 행동 카드 |
| 크론 가동 준비 완료 | 문서 명령 복붙만으로 잡 등록 가능 + 빈 시크릿 우회 차단 | `docs/06` §7 확인, `Bearer undefined` 호출 테스트 |
| (운영 제안 이행 시) 트윗 발행 | X 계정에 매일 1스레드 자동 발행 | X 타임라인 + 크론 응답 로그 |

---

## SRS 반영 제안 (제안만 — 직접 수정 금지)

1. **§3 FR 추가 제안**: "FR-9 운영 계측" 절 신설 — 방문/이벤트 수집(`/api/visit`, `/api/event`), 화이트리스트 정책, D1/D7 코호트, 관리자 대시보드를 정식 요구사항으로 편입(현재 SRS에 계측 관련 FR이 전혀 없음).
2. **§5 API 계약 표 추가 제안**: `POST /api/visit`, `POST /api/event`(공개·rate limit), `POST /api/internal/post-daily-tweet`, `POST /api/internal/weekly-digest`(CRON_SECRET) 행 추가 — 현재 표에 누락.
3. **§7 SEC-2 문구 보강 제안**: "CRON_SECRET **미설정 시 전면 거부**(빈값/`undefined` 문자열 우회 차단)"를 명시 — FR-3에서 발견된 결함 패턴의 재발 방지.
4. **§8 법적/운영 보강 제안**: 수집 항목 목록에 "무작위 디바이스 ID(쿠키), referrer 호스트, utm 파라미터 — 개인 식별 불가 형태로 최소수집" 명시 및 개인정보처리방침 연동.

---

## 미해결 / 리스크

1. **프로덕션 크론 실태 미확인** (research 미해결 1): `post-daily-tweet`/`weekly-digest` 미가동은 레포 근거 기반 추정. 운영 제안 1의 `gcloud jobs list`로 확정해야 하며, 이미 등록돼 있다면 FR-3의 문서화는 현행화 작업으로 성격이 바뀐다.
2. **개인정보 최소수집** (SRS §8): referrer/utm은 개인 식별 정보는 아니나 행태정보 수집 확대에 해당. 본 기획은 **호스트만 저장·utm 3종 한정·무작위 UUID 유지·props에 위치/검색어 금지**로 최소화했다. 개인정보처리방침에 수집 항목 반영 필요 여부는 운영 확인 사항(운영 제안 4).
3. **유입 채널 실데이터 부재로 인한 기초선 공백** (research 미해결 2): FR-2 배포 전 기간의 채널 데이터는 소급 불가(컬럼이 없었음). D1/D7만 소급 가능. 채널 지표는 배포 시점부터 누적 — 기초선 확보까지 1~2주 소요.
4. **D1/D7 해석 한계**: 디바이스(쿠키) 기준이라 쿠키 삭제·브라우저 변경·사파리 ITP로 실제보다 낮게 측정될 수 있다. 절대값보다 **주간 추이 비교** 용도로 사용해야 한다(대시보드 카드 라벨/문서에 명시 권장).
5. **RPC 성능**: `page_visits` 규모(일 150행 내외)에서 self-join 코호트 쿼리는 문제없으나, DAU 1만 규모(NFR-4)에서는 인덱스·머티리얼라이즈 재검토 필요 — 현 규모에선 수용.
6. **X API 무료 티어 한도·정책 변경** (research 미해결 4): 자동 발행 지속 가능성은 외부 확인 필요. 코드는 이미 skip-safe 설계라 리스크는 운영 측에 한정.
7. **관리자 카드 증가로 인한 대시보드 가독성**: 카드가 13개 → 17~18개로 늘어난다. 이번엔 그리드 추가로 수용하되, 다음 확장 시 섹션 구분(유입/리텐션/행동/시스템) 리디자인을 후보로 남긴다.
