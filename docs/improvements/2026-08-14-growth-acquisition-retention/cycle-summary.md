# 사이클 요약: 성장 계기판 구축 + 잠자는 크론 가동 준비

> 사이클 폴더: `docs/improvements/2026-08-14-growth-acquisition-retention/`
> 기획 페이즈 2026-08-14 · 실행 페이즈 2026-08-15 · 총괄 PM

## 주제와 선정 이유

DAU 150 정체의 1차 병목은 "성장 시도 부족"이 아니라 **성장 시도의 성패를 판정할 계기판(계측·리텐션·유입 지표) 부재**라는 research.md 결론에 따라, 우선순위 1위(계측 확장)를 중심에 두고 이미 구현돼 있으나 잠자던 크론 2종(데일리 트윗·주간 다이제스트)의 가동 준비를 함께 처리했다. 사용자 화면 변경이 없어(관리자 내부 화면만) 디자인 페이즈는 정당하게 생략되었다.

## 단계별 산출물

- 조사: [research.md](research.md)
- 기획: [plan.md](plan.md) — FR-1/2/3
- 디자인: 생략 (최종 사용자 화면 변경 없음 — 관리자 대시보드는 기존 카드 패턴 재사용)
- QA 리포트: [qa-report.md](qa-report.md)

## 구현 요약 (FR별)

- **FR-1 핵심 행동 이벤트 계측(P0)**: `funnel_events` 화이트리스트에 6종 추가(`station_detail_view`, `navi_click`, `forecast_view`, `route_search`, `fuel_log_saved`, `pwa_install`). 신규 `StationViewTracker.tsx`로 상세 열람 계측, NaviButton/ForecastCard/route/FuelLogButton/InstallBanner/InstallButton에 fire-and-forget `track()` 삽입. props는 `stationId`/`direction`/`outcome`만(PII 없음). EV 상세에도 `navi_click` 발화.
- **FR-2 유입 채널 + D1/D7 코호트(P0)**: 마이그레이션 `0034_visit_channels_retention.sql`(멱등) — `page_visits`에 `ref_host`/`utm_source`/`utm_medium`/`utm_campaign` 컬럼, D1/D7 리텐션 RPC 2개 + 채널 집계. `VisitPing`이 referrer 호스트만 + utm 3종 전송, `recordVisit`은 채널 upsert 실패 시 3필드 fallback으로 **방문 유실 방지**(first-touch). `/admin`에 D1/D7·채널 TOP3·행동 카드 4종 추가, 전부 Mock/RPC부재/실패 시 '-' 폴백.
- **FR-3 크론 보안 + 문서(P1)**: `Bearer undefined`/`Bearer ` 빈 시크릿 우회 결함을 internal 라우트 10종 + `daily-top10` + `billing/charge-cron`에 `secret.length === 0` 가드로 전면 차단(SEC-2). `docs/06_배포_firebase.md` §7에 잡 2종 등록 명령 추가, `.env.example`에 X env 4종 추가.

## 변경 파일 요약

- 신규: `components/station/StationViewTracker.tsx`, `supabase/migrations/0034_visit_channels_retention.sql`
- FR-1/2: `app/admin/page.tsx`, `app/api/event/route.ts`, `app/api/visit/route.ts`, `lib/db/stats.ts`, `components/VisitPing.tsx`, `components/forecast/ForecastCard.tsx`, `components/station/{NaviButton,FuelLogButton}.tsx`, `components/pwa/{InstallBanner,InstallButton}.tsx`, `app/route/page.tsx`, `app/station/[id]/page.tsx`, `app/ev/[statId]/page.tsx`
- FR-3: `app/api/internal/*`(10) + `app/api/internal/daily-top10/route.ts`, `app/api/billing/charge-cron/route.ts`, `docs/06_배포_firebase.md`, `.env.example`

## 리뷰 · QA 판정

- 코드 리뷰: 1차 ⚠️ 조건부(Major 1 — 채널 컬럼 미적용 환경 방문 유실 창; Minor 3) → 수정 후 2차 **✅ 머지 가능**.
- QA: **통과**. typecheck/lint/build 3종 통과. FR-3 보안 가드는 실서버 curl로 `Bearer undefined`/빈값/헤더없음 모두 **403** 실증, 정상 시크릿 호출 graceful skip 확인.
- 브라우저 미확증(환경 제약, AC 실패 아님): `/admin` 카드 실렌더(ADMIN_EMAILS 게이트), `station_detail_view` sendBeacon 실발화(Mock에 상세 데이터 없음) — 코드/엔드포인트 검증으로 갈음. 실데이터 배포 후 육안 재확인 권장.

## 미해결 · 리스크

1. **DB 마이그레이션 0034 프로덕션 적용은 사용자 몫**(아래 후속 작업). 코드가 마이그레이션보다 먼저 배포되는 창에서 채널값 있는 방문은 fallback으로 방문 자체는 보존되나 채널은 소급되지 않음(first-touch 설계 한계). 유실 최소화하려면 0034를 코드 배포 전/동시 적용 권장.
2. D1/D7은 디바이스(쿠키) 기준이라 쿠키 삭제·사파리 ITP로 과소측정 가능 — 절대값보다 주간 추이 비교용(카드에 hint 명시).
3. 채널 실데이터는 배포 시점부터 누적(소급 불가). 기초선 확보에 1~2주.
4. 크론 실가동(Cloud Scheduler 등록·X env 주입)은 콘솔 작업으로 코드 범위 밖.

## 다음 사이클 제안

1. **A4 공유 루프**(상세/TOP10 공유 버튼 + 주유소별 동적 OG, `share_click` 계측 추가) — 계기판이 생겼으니 이제 공유 효과를 측정할 수 있다.
2. **크론 실가동 후 weekly-digest 멱등키** 추가(재실행 중복 발송 방지) + 배포 창 방문 유실 창 축소를 위한 마이그레이션-우선 배포 절차 정착.
