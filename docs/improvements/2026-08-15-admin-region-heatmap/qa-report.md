# QA 리포트: 관리자 지역별 접속 집계 지도 (시도 단계구분도)

> QA: 2026-08-15 · 대상 plan: `docs/improvements/2026-08-15-admin-region-heatmap/plan.md`
> 검증 범위: `[세션]` 태그 AC만. `[운영자]` AC는 범위 밖.

## 판정: 조건부 통과

- 정적 검증(typecheck/lint/build) **무오류**.
- 브라우저로 검증 가능한 공개 경로(`/legal/privacy`, `/api/visit`, 홈, `/admin` 게이트)는 **전부 통과**.
- FR-3 `/admin` 시각화 섹션은 `/admin`이 ADMIN_EMAILS + `getAdminOrNull()` 게이트라 로그인 세션 없이는 `notFound`(설계상 정상, 실제 404 확인). 따라서 지도·표·범례·미상·hint·attribution·모바일·다크 항목은 **브라우저 렌더 대신 코드 리뷰 + 로직 실행(분위 계산)으로 갈음**했다. plan FR-3 AC(160)가 이 갈음을 세션 검증 방법으로 명시하고 있고, **AC 실패는 1건도 없다**. 브라우저 미수행 항목이 있어 정직하게 "조건부 통과"로 표기한다.

## 정적 검증

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ 통과, 오류 0 |
| `npm run lint` (next lint) | ✅ `No ESLint warnings or errors` |
| `npm run build` | ✅ 통과 (전 라우트 정상 빌드, MAXMIND_LICENSE_KEY·mmdb 없는 환경) |

전제 확인: `data/geoip/` 없음 + `maxmind` 동적 import이므로 빌드/타입/린트가 GeoIP 자산 없이 통과.

## 시나리오 결과 (AC별)

### FR-1 마이그레이션 0035
- ✅ `[세션]` 파일 존재 + 컬럼(`add column if not exists sido_code`)·인덱스(`page_visits_date_sido_idx`)·RPC(`visit_regions`) 3개 오브젝트 모두 포함.
- ✅ `[세션]` 멱등: `add column if not exists` / `create index if not exists` / `create or replace function`만 사용.
- ✅ `[세션]` RPC에 NULL 제외 필터 없음 — `group by v.sido_code`만, `where sido_code is not null` 부재. '미상' 그룹 포함.
- ✅ `[세션]` 파일 상단 주석에 "운영자가 Supabase에서 수동 실행" + "IP 원본은 저장하지 않는다(0029 원칙)" 한국어 명시.

### FR-2 수집 파이프라인
- ✅ `[세션]` `clientIp()`가 `x-fah-client-ip`.trim() 최우선 → XFF 첫 값 → `x-real-ip` → `'unknown'`. 헤더 전무 시 'unknown' 유지(rate limit 회귀 없음).
- ✅ `[세션]` 결정적 제약: 키·mmdb 없는 환경에서 build/typecheck/lint 통과 + `/api/visit` POST → **HTTP 200 `{"ok":true}`** (curl로 확인). lookupSido는 파일 부재로 null.
- ✅ `[세션]` `lookupSido()` throw 없음: 외곽 try/catch + `import('maxmind').catch(()=>null)` + reader null 가드 + `isPrivateOrInvalid` 컷 + `unknown`/빈 IP 컷. 모든 경로 null 반환.
- ✅ `[세션]` IP 원본 미저장·미로깅: `recordVisit`은 `sido_code`(변환 결과)만 받고 `page_visits` insert 필드에 ip 없음. route/stats/lookup 전체에 `console.*(ip)` 없음(grep 확인). ip는 rate-limit 키(`keys.visitRate(ip)`, 기존)와 `lookupSido` 인자로만 사용.
- ✅ `[세션]` `recordVisit` 단계적 fallback: 전체(채널+지역) → 채널만(지역 제외) → base 3필드. 어느 단계 성공이든 방문 유실 0. 0035 미적용 배포 창 방어.
- ✅ `[세션]` `sido-map.ts`: 17개 시도 전부 + 강원(KR-42/KR-51)·전북(KR-45/KR-55) 신구 코드 모두, 값 타입 `SidoCode`. `SidoCode`는 정확히 17종(01–11,14–19)이며 map/grid/mock 전부 일치.
- ✅ `[세션]` Mock 모드: `isSupabaseConfigured()` false → `recordVisit` no-op. lookupSido가 우회 호출돼도 null 반환·부작용 없음(`/api/visit` 200 확인).
- ✅ `[세션]` 다운로드 스크립트 존재 + 키 없이 실행 시 안내 메시지 출력 후 **exit 1**(직접 실행 확인). build/CI 미연결(package.json geoip:download는 독립 script).
- ✅ `[세션]` privacy 제1조 문구: **브라우저 렌더 확인** — "접속 지역 추정을 위한 자동 수집: 접속 IP로부터 추정한 접속 지역(시도 단위). IP 원본은 저장하지 않으며, 추정된 시도 코드만 통계 목적으로 기록됩니다." 실제 화면에 노출.

### FR-3 관리자 시각화 (`/admin` 게이트로 브라우저 렌더 불가 → 정적/로직 갈음)
- ✅(정적) `[세션]` Mock 분기: `getRegionVisits`가 `NEXT_PUBLIC_USE_MOCK==='true' || !isSupabaseConfigured()`면 17개 시도 + '미상'(null) 고정 집계 반환. 관례 이탈 사유 주석 명시.
- ✅(정적) `[세션]` '미상'(null=33) → 표 하단 고정 행 + 지도 옆 대시보더 무채색 블록(`MisangBlock`) 이중 노출.
- ✅(로직) `[세션]` 색 농도 4단계 구분: mock 값으로 분위 임계값 q1=8/q2=15/q3=27 산출, 17개 시도가 step 1·2·3·4 **모두 사용**(스탠드얼론 실행 확인). 범례는 0단계 + 4구간 실측 표기.
- ✅(정적) `[세션]` 개인 좌표·핀 없음: SVG는 시도 타일 rect + 시도명 + 방문수 텍스트뿐. 좌표성 마크 부재.
- ✅(정적) `[세션]` hint 라벨("IP 기반 추정(GeoLite2)…추이 참고") + GeoLite2 attribution 문구 섹션 내 상수로 렌더.
- ✅ `[세션]` 비관리자/비로그인 `/admin` = **notFound(HTTP 404 확인)**, noindex 메타 유지(page.tsx 게이트·metadata 그대로).
- ✅(정적) `[세션]` `getRegionVisits` null(실환경 RPC 미적용 가정) → `RegionVisitsSection`이 "데이터 없음 — 마이그레이션 0035 적용 후…" 폴백 렌더, hint 유지, 페이지 안 깨짐.
- ⚠️(브라우저 미수행) `[세션]` 라이트 고정 대비/모바일 375px 렌더: `/admin` 게이트로 실제 뷰포트 렌더 확인 불가. 코드상 라이트 고정(`colorScheme:'light'` 페이지 컨텍스트, 컴포넌트에 dark: 클래스 없음) + 모바일 `grid-cols-1 md:grid-cols-2` 세로 스택 + `max-w-[368px]` SVG로 설계됨. 시각 확인은 운영자 로그인 후 가능.

## 콘솔 에러
- `/legal/privacy` 로드 시 콘솔 에러/예외 없음(read_console_messages onlyErrors=true).

## 모바일·다크모드 확인 결과
- `/legal/privacy`(공개 페이지): 데스크톱 렌더 정상, 콘솔 무오류. `/admin` 핵심 화면은 게이트로 모바일·다크 뷰포트 브라우저 확인 미수행(코드상 라이트 고정·반응형 세로 스택 설계 확인). 이 항목이 "조건부" 판정의 유일한 근거.

## 발견 문제 상세
- 이번 변경 범위에서 **AC 실패·회귀 없음**. 수정 필요 항목 없음.

## 미해결/리스크
- `/admin` 시각화의 실제 화면(색 대비·모바일 스택·미상 블록 배치)은 운영자 로그인 세션에서만 육안 검증 가능 — 이번 세션 QA는 코드/로직 갈음. 배포 후 운영자 1회 육안 확인 권장.
- plan 미해결 승계(범위 밖): `x-fah-client-ip` 실수신 여부·GeoLite2 메모리(OOM)·모바일 통신사 IP 수도권 편중·ISO 신구 코드 실측은 모두 운영 도입 후 검증 사항(`[운영자]`).
- 범위 밖 관찰(판정 무관): 없음.
</content>
</invoke>
