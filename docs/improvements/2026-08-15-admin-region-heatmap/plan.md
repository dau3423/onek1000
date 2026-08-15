# 기획서: 관리자 지역별 접속 집계 지도 (시도 단계구분도)

> 작성: 2026-08-15 기획 담당 · 근거: 같은 폴더 `research.md`
> 채택안: research A-(a) — 서버 IP(x-fah-client-ip) → GeoLite2 → `page_visits.sido_code` first-touch 저장
> → `/admin` 스키매틱 SVG 단계구분도 + 수치 표.

## 배경·목표

- 운영자는 현재 방문자수·채널·퍼널·리텐션은 보지만 **어느 지역에서 접속하는지 전혀 모른다**
  (research "문제/기회"). 지역별 수요를 모르면 SEO 지역 랜딩(211개 시군구 페이지)·SNS 발행·
  마케팅 투자가 감으로 이뤄진다.
- 방문 수집 파이프라인(`/api/visit`→`recordVisit`→`page_visits`), 시도 코드 체계(`SidoCode` 17종),
  관리자 대시보드 패턴(RPC 래퍼·graceful '-'·hint 카드)이 모두 존재하므로, 추가 조각은
  "IP→시도 변환 + 컬럼 1개 + 집계 섹션"뿐이다.
- **이번 사이클이 끝나면**: 운영자가 `/admin`에서 최근 7일 시도별 방문 수를 색 농도 지도와
  순위 표로 확인하고, 지역 타겟 의사결정(랜딩/발행/마케팅)의 근거를 얻는다.

### 확정 정책 제약 (변경 불가 — 모든 FR·AC에 우선)

1. **집계 전용**: 시도 단위 방문 수를 색 농도로만 표시. 개인별 핀·개인 단위 표시 절대 금지.
2. **개인 좌표·정밀 위치 저장 금지**: 신규 저장은 시도 코드(`sido_code`)까지만. **IP 원본 미저장**
   (0029 "IP 미저장" 원칙 유지 — 변환 결과만 남긴다).
3. **알람용 GPS(`users.last_lat/lng`)·`interest_regions` 좌표 재사용 금지** — 데이터 소스로 쓰지 않는다.
4. **관리자 전용**: `/admin`(ADMIN_EMAILS 게이트, `getAdminOrNull()` 실패 시 `notFound()`, noindex).
5. **개인정보처리방침 최소 문구 반영**(FR-2 AC에 포함).

### 이번 세션의 하드 제약

- `npm run typecheck` · `npm run lint` · `npm run build`가 **MAXMIND_LICENSE_KEY·mmdb 없이 통과**해야 한다.
- Mock 모드(`NEXT_PUBLIC_USE_MOCK=true`)에서 **외부 키 없이 UI(지도+표)를 브라우저로 검증**할 수 있어야 한다.
- 프로덕션 마이그레이션 적용·GeoIP DB 도입은 **운영자 몫**이며 코드/문서에 명시한다.
  아래 AC는 `[세션]`(이번 세션에서 개발자·QA가 검증)과 `[운영자]`(배포 후 운영자 절차)로 구분한다.

## 유저 스토리

- **운영자로서**, 사용자들이 어느 시도에서 접속하는지 한눈에 보고 싶다. 그래서 어떤 지역
  랜딩·SNS 콘텐츠·마케팅에 투자할지 감이 아닌 데이터로 정한다.
- **운영자로서**, 지역을 알 수 없는 방문('미상')이 얼마나 되는지도 함께 보고 싶다. 그래서
  이 통계를 얼마나 신뢰할 수 있는지 스스로 판단한다.
- **사용자(운전자)로서**, 내 위치가 정밀하게 저장되거나 노출되지 않기를 바란다. 그래서
  서비스는 시도 코드 수준까지만, 집계로만 다룬다.

---

## 기능 요구사항

### FR-1: 스키마 — 마이그레이션 0035 (P0)

- **설명**: `page_visits`에 접속 지역(시도) 컬럼과 기간 집계 RPC를 추가한다.
  0034(`supabase/migrations/0034_visit_channels_retention.sql`)의 형식(add column if not exists +
  index if not exists + create or replace function, 상단 정책 주석)을 그대로 따른다.
- **구현 위치**: `supabase/migrations/0035_visit_regions.sql` (신규 파일 1개)
- **내용 요구**:
  - `alter table page_visits add column if not exists sido_code text;` — Opinet 시도 코드('01'~'19'),
    GeoIP 실패/미상은 NULL. 파일 상단 주석에 "IP 원본은 저장하지 않는다(0029 원칙 유지)" 명시.
  - `create index if not exists page_visits_date_sido_idx on page_visits (visit_date, sido_code);`
  - `create or replace function visit_regions(days int default 7) returns table(sido_code text, visits bigint)`
    — KST 기준 최근 `days`일의 시도별 고유 방문 수(행이 일×디바이스 유니크라 `count(*)`).
    **research 초안의 `where sido_code is not null` 필터는 제거한다**: NULL 그룹을 결과에 포함해
    '미상' 집계를 같은 쿼리에서 얻는다(정책 제약 및 FR-3 '미상' 정직 노출의 데이터 원천).
- **AC**:
  - [ ] `[세션]` `supabase/migrations/0035_visit_regions.sql`이 존재하고, 위 3개 오브젝트
        (컬럼·인덱스·RPC)를 모두 포함한다.
  - [ ] `[세션]` 마이그레이션이 멱등이다(if not exists / create or replace만 사용 — 재적용 안전).
  - [ ] `[세션]` RPC 결과에 `sido_code = NULL` 행(미상)이 포함되는 SQL이다(NULL 제외 필터 없음).
  - [ ] `[세션]` 파일 주석에 "프로덕션 적용은 운영자가 Supabase에 수동 실행" + "IP 원본 미저장"
        정책이 한국어로 명시되어 있다.
  - [ ] `[운영자]` 프로덕션 Supabase에 0035를 적용한다(이 세션 범위 아님). **적용 전 배포 창에서도**
        FR-2의 fallback 덕에 방문 기록이 유실되지 않아야 한다(FR-2 AC 참조).

### FR-2: 수집 파이프라인 — IP→시도 변환 + first-touch 저장 (P0)

- **설명**: `/api/visit` 서버에서 접속 IP를 시도 코드로 변환해 `recordVisit`에 전달한다.
  IP는 변환에만 쓰고 **저장·로깅하지 않는다**.
- **구현 위치**:
  - `app/api/visit/route.ts` — `clientIp()`(현재 `:35-42`) 확장: **`x-fah-client-ip` 최우선** →
    `x-forwarded-for` 첫 값 → `x-real-ip` → `'unknown'` 순. (Firebase App Hosting 전용 헤더,
    research "외부 사례" 절 근거. XFF 첫 값은 위조 가능하므로 통계 소스로는 전용 헤더 우선.)
  - `lib/geoip/` (신규 모듈) — 예: `lib/geoip/lookup.ts` + `lib/geoip/sido-map.ts`
    - `lookupSido(ip: string): Promise<SidoCode | null>` 형태의 단일 진입점.
    - `maxmind` npm(순수 JS mmdb 리더) 사용, Reader는 **lazy 싱글턴**(첫 조회 시 1회 로드).
    - mmdb 파일 경로는 env(`GEOIP_DB_PATH` 등)+기본 경로로 해석. **파일 부재·로드 실패·
      ip가 'unknown'/사설/형식 불량·subdivision 없음 → 항상 null 반환, throw 금지.**
    - `sido-map.ts`: ISO 3166-2:KR subdivision 코드 → `SidoCode`(`types/station.ts:45-54`) 정적 매핑.
      **강원(KR-42·KR-51)·전북(KR-45·KR-55) 신구 코드 모두 수록**(17+α 엔트리, research 리스크 4).
  - `lib/db/stats.ts` — `recordVisit()`에 `sido_code?: string | null` optional 추가. 0034 채널과
    동일한 first-touch 의미론(ignoreDuplicates — 하루 첫 방문의 지역만 남음) + **컬럼 부재 시
    해당 필드 제외 재시도 fallback**(`:36-39` 주석의 배포 안전성 로직에 sido_code 편입).
  - `package.json` — `maxmind` 의존성 추가(이외 신규 의존성 금지).
  - `scripts/` — GeoLite2-City mmdb 다운로드 스크립트(예: `scripts/download-geolite2.mjs`,
    `MAXMIND_LICENSE_KEY` 사용, npm script 예: `geoip:download`). 키 없이 실행하면 명확한
    안내 메시지와 함께 실패(빌드와는 무관한 독립 스크립트).
  - 운영 문서 — README(또는 `docs/` 운영 문서)에 "GeoIP DB 도입 절차" 추가: MaxMind 계정·
    라이선스 키 발급 → 시크릿 설정 → 다운로드 스크립트 → 배포 반영 방법. **실제 DB 도입·적용은
    운영자 몫**임을 명시.
- **개인정보처리방침(정책 제약 5)**: `app/legal/privacy/page.tsx` 제1조 자동수집 항목(`:26` 부근)에
  최소 한 줄 추가 — "접속 IP로부터 추정한 접속 지역(시도 단위, IP 원본은 저장하지 않습니다)"
  취지의 문구(0034 전례 f9d5d93 부합).
- **AC**:
  - [ ] `[세션]` `clientIp()`가 `x-fah-client-ip`를 최우선으로 읽는다(값이 있으면 XFF보다 우선).
        기존 rate limit 동작(헤더 전무 시 'unknown')은 그대로다.
  - [ ] `[세션]` **결정적 제약**: `MAXMIND_LICENSE_KEY`도 mmdb 파일도 없는 환경(로컬/CI/이 세션)에서
        `npm run build`·`typecheck`·`lint`가 모두 통과하고, `/api/visit` POST가 기존과 동일하게
        200을 반환한다(GeoIP 조회는 null → sido_code 미포함/NULL로 저장 시도, throw 없음).
  - [ ] `[세션]` `lookupSido()`는 어떤 입력·환경에서도 throw하지 않는다(부재/실패/불량 입력 → null).
  - [ ] `[세션]` IP 원본은 어디에도 저장·로깅되지 않는다(코드 리뷰 확인 항목: `page_visits` insert
        필드, console/log 출력에 ip 부재).
  - [ ] `[세션]` `recordVisit`은 sido_code 포함 upsert 실패 시 해당 필드를 제외하고 재시도해
        **방문 자체를 유실하지 않는다**(0035 미적용 배포 창 안전 — 채널 fallback과 동일 패턴).
  - [ ] `[세션]` `sido-map.ts`에 17개 시도 전부 + 강원/전북 신구 ISO 코드가 매핑되어 있고,
        값 타입이 `SidoCode`다(타입체크로 오타 방지).
  - [ ] `[세션]` Mock 모드: `recordVisit`은 기존대로 no-op(`isSupabaseConfigured()` false)이고,
        GeoIP lookup이 이를 우회해 호출되어도 부작용이 없다.
  - [ ] `[세션]` `scripts/` 다운로드 스크립트가 존재하고, 키 없이 실행 시 안내 후 비정상 코드로
        종료하되 **빌드 파이프라인을 막지 않는다**(build에 자동 연결하지 않음).
  - [ ] `[세션]` privacy 제1조에 접속 지역(시도 단위) 추정 문구 1줄이 추가되어 있다
        (브라우저 `/legal/privacy`에서 확인 가능).
  - [ ] `[운영자]` MaxMind 계정/키 발급, 시크릿 설정, mmdb를 배포에 포함(다운로드 스크립트 활용),
        배포 후 `sido_code`가 실제 채워지는지 확인. `x-fah-client-ip` 실제 수신 여부 1회성 검증
        (미해결 1). — 이 절차가 README/운영 문서에 적혀 있는 것까지가 `[세션]` 범위.

### FR-3: 관리자 시각화 — /admin 지역별 접속 집계 섹션 (P0)

- **설명**: `/admin` 대시보드(통계 카드 그리드와 도구 허브 사이)에 "지역별 접속 (최근 7일)"
  섹션을 추가한다. **직접 저작한 스키매틱 SVG**(시도 17개를 지리적 상대 위치에 맞춘 타일/블록형
  배치 — 외부 시도 경계 GeoJSON 사용 금지, 라이선스 리스크 회피)로 단계구분도를 그리고,
  옆/아래에 수치 표를 병기한다.
- **구현 위치**:
  - `lib/db/stats.ts` — `getRegionVisits(days = 7)` 래퍼 신설: `visit_regions` RPC 호출,
    실패/미적용 시 null(기존 `getTodayChannels` `:192-204` 패턴). **Mock 분기 추가**(아래 Mock 전략).
  - `components/admin/RegionTileMap.tsx`(신규, 서버 컴포넌트 — SDK·클라이언트 JS 불필요) 또는
    admin 페이지 내 분리 컴포넌트: SVG 타일 지도 + 표.
  - `app/admin/page.tsx` — 섹션 삽입(기존 게이트·noindex·force-dynamic·라이트 고정 그대로).
- **표시 요구**:
  - **지도**: 17개 시도 타일. 색 농도는 **방문수 분위(quantile) 기반 4~5단계**(방문 0은 최저
    단계/무채색). 각 타일에 시도명(`SIDO_NAME`)과 방문수 표기(또는 title 속성). 개인 핀·좌표
    표시는 절대 없음(집계 색 농도만).
  - **표**: 순위 · 시도명 · 방문수 · 비율(%) — 비율 분모는 '미상' 포함 기간 전체 방문수.
    방문수 내림차순.
  - **'미상' 정직 노출**: `sido_code NULL` 집계를 표의 행 + 지도 옆 별도 블록(지리 타일 밖)으로
    노출. 숨기지 않는다.
  - **한계 hint 라벨**(D1/D7 카드 전례 `app/admin/page.tsx:177-178`): "IP 기반 추정(GeoLite2) ·
    모바일 통신사 IP는 수도권으로 잡힐 수 있음 · 절대값보다 추이 참고" 취지.
  - **GeoLite2 attribution**: 섹션 하단에 "This product includes GeoLite2 data created by MaxMind,
    available from https://www.maxmind.com" 문구(EULA, research 리스크 5 — 관리자 화면 내 표기).
  - **데이터 없음 폴백**: 실 DB에서 RPC 미적용/실패(null)면 섹션은 '-' 또는 "데이터 없음" 안내로
    graceful 렌더(페이지가 깨지지 않는다 — 기존 카드 관례).
- **AC**:
  - [ ] `[세션]` Mock 모드에서 관리자로 `/admin` 접속 시 지역별 접속 섹션이 렌더되고,
        17개 시도 타일 전부에 목 데이터 기반 색 농도가 칠해지며, 표에 순위·시도명·방문수·
        비율이 방문수 내림차순으로 보인다.
  - [ ] `[세션]` Mock 데이터에 포함된 '미상'이 표의 행과 지도 옆 블록으로 함께 보인다.
  - [ ] `[세션]` 색 농도 단계가 4~5단계이고 범례(단계별 색과 값 구간)가 표시된다.
  - [ ] `[세션]` 지도에 개인 위치·핀·좌표성 표시가 일절 없다(집계 색 농도·수치만).
  - [ ] `[세션]` hint 라벨과 GeoLite2 attribution 문구가 섹션에 보인다.
  - [ ] `[세션]` 비관리자/비로그인은 기존대로 `/admin` 자체가 notFound(신규 섹션도 함께 차단),
        noindex 메타 유지.
  - [ ] `[세션]` Supabase 설정 + RPC 미적용(실환경 가정)에서도 섹션이 에러 없이 '-'/안내로
        폴백한다(`getRegionVisits`가 null 반환 → 페이지 정상 렌더). ※ 세션에서는 코드 경로
        리뷰 + Mock off·키 더미로 확인.
  - [ ] `[세션]` 관리자 페이지는 라이트 고정(`colorScheme: 'light'`) 컨텍스트에서 색 농도 대비가
        읽히고, 모바일 뷰포트(375px)에서 지도·표가 깨지지 않는다(세로 스택 허용).
  - [ ] `[운영자]` 0035 적용 + GeoIP DB 도입 후, 실데이터가 쌓이면 섹션에 실제 시도별 집계와
        '미상' 비중이 표시된다.

---

## Mock 전략 (SRS §9 "Mock 우선")

- **수집 측**: 변경 최소 — `NEXT_PUBLIC_USE_MOCK=true`면 `isSupabaseConfigured()`가 false라
  `recordVisit`이 이미 no-op(`lib/db/stats.ts:46`). GeoIP lookup은 파일 부재 시 null이라 키·DB
  없이 무해하게 동작한다.
- **표시 측**: `getRegionVisits()`에 Mock 분기 —
  `process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()`(전례:
  `lib/forecast/accuracy.ts:87`)면 **17개 시도 전체 + '미상'(NULL)을 포함한 고정 목 집계**
  (예: 서울 120 · 경기 95 · 부산 40 · … · 미상 33)를 반환한다.
  - 기존 카드들의 '-' 관례와 다른 선택이다: 지도·표 UI는 데이터 없이는 검증 자체가 불가하므로
    목 데이터를 반환한다. **이 관례 이탈 사유를 코드 주석으로 명시**한다(research C 절).
  - 목 데이터는 분위 4~5단계가 실제로 구분되도록 값 분포를 설계한다(전부 동일값 금지).
- 이 세션의 QA 시나리오는 전부 Mock 모드 기준으로 작성 가능하다(FR-3 `[세션]` AC 참조).

## 범위

### 포함 (In)

- 마이그레이션 0035 **파일 작성**(컬럼+인덱스+RPC, NULL 그룹 포함).
- `clientIp()` `x-fah-client-ip` 우선 조회 + `lib/geoip/` 조회 모듈(graceful null) +
  `recordVisit` sido_code optional(fallback 재시도) + `maxmind` 의존성 + 다운로드 스크립트 +
  운영 문서.
- `/admin` 지역별 접속 섹션: 직접 저작 스키매틱 SVG 타일 단계구분도(분위 4~5단계) + 수치 표 +
  '미상' 노출 + 한계 hint + GeoLite2 attribution + Mock 고정 집계.
- privacy 제1조 접속 지역(시도 단위) 추정 문구 1줄.

### 제외 (Out → BACKLOG 후보)

- **시군구 단위 집계(v2)**: GeoIP의 한국 도시 단위 정확도 불신 + 시도 17개로 운영 판단에 충분
  (research 추천). `lib/sigungu-data.ts` 재사용 여지는 v2에서.
- **카카오맵 Polygon 방식**: 타입 선언 + 클라이언트 컴포넌트 + 경계 GeoJSON 로딩 비용 대비
  관리자 1인 화면 이득 없음.
- **봇 트래픽 필터**(데이터센터 IP hosting/proxy 플래그 활용): 0029부터 미필터 상태와 동일 기조,
  운영 데이터 관찰 후 판단.
- **GeoLite2 메모리 튜닝 / KR 전용 압축 테이블(플랜 B)**: `memoryMiB: 512` 실측 후 필요 시.
  이번 세션은 DB 자체가 없어 실측 불가 — 운영 도입 후 판단.
- **'미상' 비율 전용 카드**(research 보완안 3): 표의 '미상' 행으로 이번엔 충분. 신뢰도 지표
  고도화는 다음 사이클.
- **외부 시도 경계 GeoJSON 기반 실경계 지도**: 원천(SGIS 파생물) 재배포 라이선스 미확인
  (research 리스크 6) — 스키매틱 타일 채택으로 이번 범위에서 원천 회피.

## 성공 지표 (사이클 후 확인)

1. `[세션]` `npm run typecheck` + `lint` + `build`가 GeoIP 키/DB 없이 통과 (DoD 2·3).
2. `[세션]` Mock 모드 `/admin`에서 17개 시도 단계구분도 + 표 + '미상' + hint + attribution을
   브라우저로 확인(QA 시나리오화 가능).
3. `[세션]` `/api/visit`이 기존과 동일하게 200 응답(회귀 없음), IP 원본 미저장 코드 리뷰 통과.
4. `[운영자·배포 후]` 0035 적용 + GeoIP DB 도입 시 실 시도별 집계가 표시되고, '미상'·서울
   비중으로 통계 신뢰도를 판단할 수 있다(research 리스크 3의 관찰 지표).

## SRS 반영 제안 (제안만 — 직접 수정하지 않음)

- **§4 데이터 모델**: `page_visits`(0029~0035: visit_date·device_id·user_id·채널 4컬럼·
  `sido_code`) 요약 행 추가 — 현재 SRS에 방문 통계 테이블 자체가 누락되어 있다.
- **§3 기능 요구사항**: "3.9 운영/관리자 대시보드(P1)" 절 신설 제안 — ADMIN_EMAILS 게이트·
  noindex·통계 카드·지역별 접속 집계(집계 전용, IP 원본 미저장)를 FR로 명문화.
- **§7 보안**: "SEC-8 접속 IP는 rate limit·지역 추정(시도 코드 변환)에만 사용하고 원본을
  저장하지 않는다" 추가 제안.
- **§8 법적/운영**: GeoLite2 EULA attribution 표기 의무(관리자 화면) 1줄 추가 제안.
- 충돌 없음: 신규 공개 API 없음(§5 표 변경 불필요 — admin 서버 컴포넌트가 lib 함수 직접 호출),
  Mock 우선(§9)·DoD(§10) 준수 전제로 설계했다.

## 미해결/리스크 (research 승계 + 이번 기획 판단)

1. **`x-fah-client-ip` 실측 미완**(research 1): Arcjet 블로그 근거, Firebase 공식 문서 미확인.
   배포 후 1회성 검증은 운영자 몫. 폴백(XFF 첫 값)은 위조 가능하나 통계 용도라 치명적이지 않음.
2. **메모리 제약**(research 2): GeoLite2-City mmdb ~60MB vs `memoryMiB: 512`. lazy-load로
   완화하되 OOM 실측은 운영 도입 후. 실패 시 플랜 B(KR 압축 테이블) 또는 memoryMiB 상향 — Out.
3. **모바일 통신사 IP 수도권 편중**(research 3): 정량 미확인 가설. hint 라벨로 상시 고지(FR-3 AC),
   배포 후 '미상'·서울 비중 관찰로 판단.
4. **ISO 3166-2:KR 신구 코드**(research 4): GeoLite2가 강원/전북 신·구 어느 코드를 주는지 실측
   불가(이 세션에 DB 없음) → 매핑 표에 신구 모두 수록으로 방어(FR-2 AC).
5. **GeoLite2 EULA 해석**(research 5): attribution은 관리자 섹션 하단 표기로 대응(FR-3).
   DB 갱신 주기(재배포 시 갱신, 배포가 뜸하면 구버전) 요건 해석은 운영자 확인 사항으로 문서화.
6. **MaxMind 다운로드 방식 변동 가능성**(신규): 다운로드 엔드포인트가 license_key 쿼리 방식과
   계정 기반 인증 방식이 병존해 왔다. 스크립트 작성 시 현행 방식 확인 필요 — 어느 쪽이든
   스크립트는 독립 실행형이라 빌드에 영향 없음.
7. **0035 미적용 배포 창**: 코드가 먼저 배포되면 sido_code 포함 upsert가 실패한다 — FR-2의
   필드 제외 재시도 fallback으로 방문 유실 0을 보장(0034 전례와 동일, AC로 검증).
8. **봇 혼입**(research 8): 미필터 상태 유지 — 지역 통계에 데이터센터 IP가 섞일 수 있음을
   운영자가 인지(Out/BACKLOG).
