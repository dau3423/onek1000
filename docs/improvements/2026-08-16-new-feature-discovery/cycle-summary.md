# 사이클 요약: 신규 기능 발굴 → 세차 묶음 기능 (2026-08-16)

> 상태: **실행 페이즈 완료 · 커밋됨(push 대기)**. 기획 페이즈(조사~디자인)는 사용자 승인 후 실행 페이즈(구현→리뷰→QA→커밋)로 이어짐.

## 주제와 선정 이유
- 사이클 주제: **신규 기능 발굴** — 기존 기능 개선·버그가 아니라 서비스에 새로 추가할 기능을 조사·선정.
- researcher가 경쟁사(오일나우·티맵·GasBuddy·gogo.gs)·사용자 니즈·자산 시너지를 근거로 후보 7개(C1~C7)를 4축 점수화(`research.md`).
- researcher 추천은 C1(개인화 주유 타이밍)이었으나, **PM은 C2(세차 묶음)를 선정**. 근거:
  1. **가치/비용 비 최우수**: 비용 하~중, 전 사용자 즉시 도달(C1은 "주유기록 3회 이상"이라는 미해결 대상 규모 제약 — DAU 150에서 도달 가능 사용자 극소수 리스크).
  2. **차별성**: 국내 주유 앱 중 "세차하기 좋은 날" 결합 사례 없음.
  3. **자산·규제 저부담**: `stations.has_carwash` 이미 DB 존재, 기상청 단기예보는 무료 공공 API + 기존 data.go.kr 연동 패턴(`lib/ev/client.ts`) 재사용. Opinet 호출 0건 추가.
  4. **성장 시너지**: 최근 완료한 X 자동발행 채널의 즉시 공유 소재(단, X 연동 구현은 이번 범위 Out).
- C1은 전략적 최상위 차선 → 주유기록 채택률이 오른 뒤 후속 사이클로 시퀀싱. BACKLOG에 등재.

## 단계별 산출물
- 조사: [research.md](research.md) — 후보 7개 비교표·점수·근거·규제 제약.
- 기획: [plan.md](plan.md) — FR-1~FR-3, AC, 마이그레이션 0036/0037 초안, 리스크 7건.
- 디자인: [design.md](design.md) — 세차 칩·배지·CarwashDayCard 와이어프레임, 다크/모바일 지침, 미해결 9건.
- QA: [qa-report.md](qa-report.md) — Mock 모드 브라우저 시나리오 + 정적 3종.

## FR 요약 (구현 결과)
- **FR-1 세차 필터 칩 + 목록·상세 배지**: RPC 3개(`by_bbox`/`by_radius`/`by_bbox_brand`)에 `p_carwash` 파라미터·`has_carwash` 반환 추가(마이그레이션 0036, drop→create, 서버측 필터). FilterBar 세차 칩(gas 레이어, DropletIcon 신규), BottomSheet 세차 배지·세차 문맥 타이틀·빈 상태+"세차 필터 끄기"·`openSignal` 외부 열기, 상세 `amenities_updated_at` null 문구 정정+다크 변형. **마이그레이션 미적용 폴백**: `queries.ts`의 `carwashRpcSupported()` — PGRST202 감지 + 10분 TTL self-heal로 구 시그니처 폴백(앱 크래시 없음, 배지 미표시).
- **FR-2 세차 지수 파이프라인**: `lib/weather/kma.ts`(시도 17개 대표점 격자 상수 + 단기예보 POP + 에어코리아 미세먼지 파서 + 지수 산출식 + mock). `sync-weather` 크론(CRON_SECRET Bearer, 미설정/불일치 401, 시도별 부분 실패 흡수). 조회 API `/api/carwash-index`(최근접 시도 판정, rate limit). **Mock/키 없음 graceful**: 키 미설정·USE_MOCK·Supabase 미설정 시 조회 API는 mock 지수, sync-weather는 skip. `KMA_API_KEY`/`AIRKOREA_API_KEY` 서버 전용(`NEXT_PUBLIC_` 없음).
- **FR-3 홈 미니 카드 + 딥링크**: `CarwashDayCard`(ForecastCard 동형 `useEffect+fetch`, 데이터 없으면 미렌더) — 가장 좋은 날·등급 라벨·근거 한 줄·4일 스트립·CTA(세차 칩 ON 딥링크+스크롤 최상단+시트 열기)·면책/출처·오늘 하루 숨김(KST). 계측 `carwash_filter_on`/`carwash_card_click`(이벤트 화이트리스트 등록).

## 변경 파일 요약
- 신규(6+2): `app/api/carwash-index/route.ts`, `app/api/internal/sync-weather/route.ts`, `components/carwash/CarwashDayCard.tsx`, `lib/weather/kma.ts`, `supabase/migrations/0036_carwash_filter.sql`, `0037_carwash_index.sql`.
- 수정(12): `app/page.tsx`, `app/station/[id]/page.tsx`, `app/api/event/route.ts`, `app/api/stations/bbox/route.ts`, `app/api/stations/radius/route.ts`, `components/ui/FilterBar.tsx`, `components/ui/BottomSheet.tsx`, `components/icons/index.tsx`, `lib/db/queries.ts`, `lib/cache/redis.ts`, `stores/map.ts`, `.env.example`.

## 리뷰·QA 판정
- **리뷰(code-reviewer): ✅ 머지 가능**. Critical/High 0. Medium 2건 — ① 폴백 플래그 비가역(PGRST202 일시 오류에 굳음) → **보강 완료**(PGRST202 감지 축소 + 10분 TTL self-heal). ② 에어코리아 지역 토큰 매핑 근사(dust 결측 허용이라 지수 산출 무영향) → 리스크로 이월. SEC-1(서버 전용 키)·SEC-3(rate limit)·LBS 좌표 비저장·근사/면책 표현 전부 충족.
- **QA(qa-tester): ✅ 통과**. 정적 3종(typecheck/lint/build) 무오류. Mock 모드 라이브 브라우저 시나리오로 대부분 AC 성공(세차 칩 gas 노출/EV 미노출/토글, 빈 상태+필터 끄기, `carwash_filter_on` 1회, 상세 배지, sync-weather 401, `/api/carwash-index` 4일치 ~0.8s, 카드 렌더/CTA 딥링크/`carwash_card_click`/오늘 하루 숨김, 면책·단정표현 없음). **환경 제약으로 코드/API 갈음한 항목**: 지도 목록 행 배지·브랜드 AND 교집합(카카오맵 키 미설정 → `/api/stations/bbox?carwash=1`로 실증), 다크모드/모바일(OS 다크 강제·리사이즈 불가 → `dark:`·반응형 코드 검증).

## 미해결·리스크
1. **에어코리아 지역 토큰 매핑 근사**(리뷰 Medium #2): `informGrade` 지역 토큰(경기북부/남부, 강원영서/영동 등)과 시도 매핑 불일치 가능 → 미세먼지 감점이 일부 시도에서 미발동. dust는 선택 입력·결측 허용이라 지수 산출·앱 동작엔 무영향. 실 API 키 확보 후 응답 토큰으로 매핑 검증 필요.
2. **시도 대표점 격자(nx,ny)**: 시도청 도시 기준 근사값 하드코딩 → 운영 배포 전 실제 POP 응답으로 검증 권장.
3. **고속도로(EXP)+세차 동시 필터**: `expStations`는 별도 조회라 carwash 미적용. 드문 조합, v1 미대응.
4. **has_carwash 커버리지 미실측**: 운영 DB 보강률 미확인. 빈 상태 문구로 1차 방어했으나 30% 미만이면 빈 결과 잦음 — 배포 후 실측.
5. **폴백 플래그 인스턴스별 인메모리**: 다중 인스턴스에서 각각 최초 1회 이중 왕복 가능(TTL로 최대 10분 자가 회복). 필요 시 Redis 승격 — 현 범위 밖.
6. **CarwashDayCard below-the-fold**: 첫 화면 미노출(오버레이 비겹침과 맞바꿈). `carwash_card_click` 목표 미달 시 지도 위 힌트 칩 검토.

## 다음 사이클 제안
1. **C1 개인화 주유 타이밍 알림** — 주유기록 채택률 확인 후. 예측 모델(0026)+fuel_logs(0012) 결합, 경쟁사 전무.
2. 세차 지수 안정 적재(1~2주) 후 **X 자동발행 연동**(공유 소재화) — 이번 Out 항목.
