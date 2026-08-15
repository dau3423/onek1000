# 사이클 요약: 관리자 지역별 접속 집계 지도 (시도 단계구분도)

> 2026-08-15 · "컨펌 없이 한 번에" 승인 사이클(기획→실행 연속) · PM 총괄

## 주제와 선정 이유
- 사용자 지정 주제: 관리자 화면(/admin)에서 사용자들이 어느 지역에서 접속하는지 **집계 지도**로 확인.
- 확정 정책 제약(변경 불가): 집계 전용(개인 핀 금지) · 신규 저장은 시도 코드까지만(IP 원본 미저장) ·
  알람용 GPS/interest_regions 재사용 금지 · /admin 전용(ADMIN_EMAILS·noindex) · 방침 최소 문구 반영.

## 지역 추정 방식 결정
- **채택: 서버 접속 IP(`x-fah-client-ip` 우선) → MaxMind GeoLite2 → `page_visits.sido_code`(시도 코드) first-touch 저장.**
- 뷰포트/GPS/가입지역 대안은 부적합·정책 충돌·커버리지 문제로 배제(research A 비교표).
- IP 원본은 저장·로깅하지 않고 변환 결과(시도 코드)만 남겨 0029 "IP 미저장" 원칙 유지.
- 시각화는 외부 경계 GeoJSON(라이선스 리스크)을 피해 **직접 저작 스키매틱 SVG 타일 단계구분도 + 수치 표**.

## 단계별 산출물
- 조사: [research.md](research.md)
- 기획: [plan.md](plan.md) (FR-1~3, `[세션]`/`[운영자]` AC 분리)
- 디자인: [design.md](design.md) (5col×6행 타일 배치표, 5단계 blue 스케일, 확정 문구)
- QA: [qa-report.md](qa-report.md)

## 변경 파일 요약
- `supabase/migrations/0035_visit_regions.sql` (신규) — sido_code 컬럼 + 인덱스 + `visit_regions(days)` RPC(NULL 그룹 포함, 멱등)
- `lib/geoip/lookup.ts`, `lib/geoip/sido-map.ts` (신규) — graceful null GeoIP 조회 + ISO 3166-2:KR→SidoCode 매핑(강원/전북 신구 코드 병기)
- `lib/db/stats.ts` — `recordVisit` sido_code optional(3단계 fallback) + `getRegionVisits` 신설(Mock 분기)
- `app/api/visit/route.ts` — `clientIp()`에 `x-fah-client-ip` 최우선 추가
- `components/admin/RegionTileMap.tsx` (신규) — 서버 컴포넌트 SVG 타일 지도 + 표 + 범례 + hint + attribution
- `app/admin/page.tsx` — 지역별 접속 섹션 삽입(게이트·noindex·라이트 고정 보존)
- `app/legal/privacy/page.tsx` — 제1조 접속 지역(시도 단위, IP 원본 미저장) 문구 1줄
- `scripts/download-geolite2.mjs` (신규) + `package.json`(maxmind 의존성, `geoip:download`) + `.gitignore`(`/data/geoip/`) + `docs/운영_GeoIP_도입절차.md` (신규)

## 판정
- 코드 리뷰: **✅ 머지 가능** (Critical 0, Major 1건 = `.gitignore`에 `/data/geoip/` 추가 → 반영 완료)
- QA: **조건부 통과** (AC 실패 0). `/admin`은 로그인 게이트라 시각화 섹션 육안 렌더 불가 → 코드/로직 갈음.
  브라우저 실증: `/api/visit` 200, `/legal/privacy` 문구 렌더, `/admin` 비로그인 404, 홈 200. typecheck/lint/build 통과.

## 미해결·리스크
- **`x-fah-client-ip` 실측 미완**: Firebase 공식 문서 미확인. 배포 후 1회성 헤더 로깅 검증 필요(운영자).
- **메모리 제약**: GeoLite2-City mmdb ~60MB vs `memoryMiB: 512` OOM 실측은 운영 도입 후. 실패 시 KR 압축 테이블 플랜 B.
- **모바일 통신사 IP 수도권 편중(가설)**: hint 라벨로 상시 고지, 배포 후 '미상'·서울 비중 관찰로 판단.
- **/admin 시각화 육안 미검증**: 색 대비·375px 세로 스택·미상 블록 배치는 운영자 로그인 세션 1회 확인 권장.
- **GeoLite2 EULA**: attribution은 섹션 하단 표기로 대응. DB 갱신 주기 해석은 운영자 확인.

## 운영자 후속 작업 (세션 범위 밖)
1. **마이그레이션 0035 프로덕션 적용**: Supabase SQL 에디터에서 `supabase/migrations/0035_visit_regions.sql` 수동 실행.
2. **GeoIP DB 도입**: MaxMind 계정·라이선스 키 발급 → 시크릿 `MAXMIND_LICENSE_KEY` 설정 → `npm run geoip:download` → 배포에 mmdb 포함. 상세 절차는 `docs/운영_GeoIP_도입절차.md`.
3. 배포 후 `sido_code` 실채움·`x-fah-client-ip` 수신 여부 1회 확인.
> 위 1·2 적용 전에도 FR-2 fallback으로 방문 기록 유실은 없음(대시보드는 '미상'/데이터 없음으로 폴백).

## 다음 사이클 제안
1. **시군구 단위 집계(v2)**: 운영 데이터로 GeoIP 도시 정확도·수요를 확인한 뒤 `lib/sigungu-data.ts` 재사용.
2. **'미상' 비율 신뢰도 카드 + 봇/데이터센터 IP 필터**: 통계 신뢰도 지표 고도화.
