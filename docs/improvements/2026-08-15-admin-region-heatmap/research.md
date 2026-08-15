# 조사 보고: 관리자 지역별 접속 집계 지도(시도 단계구분도)

> 작성: 2026-08-15 자료조사 담당 · 주제 지정 모드
> 정책 제약(변경 불가): 집계 전용(개인 핀 금지) · 지역 코드(시도/시군구)까지만 신규 저장 ·
> 알람용 GPS(last_lat/lng) 재사용 금지 · /admin 전용(ADMIN_EMAILS, noindex) · 개인정보처리방침 범위 검토

## 요약 (추천 1줄)

**`/api/visit` 서버에서 접속 IP(x-fah-client-ip)를 MaxMind GeoLite2로 시도 코드('01'~'19')로 변환해
`page_visits.sido_code`(신규 컬럼, IP 원본 미저장)에 first-touch로 남기고, /admin에 정적 SVG 시도
단계구분도 + 수치 표를 추가한다** (마이그레이션 0035 + RPC `visit_regions`).

---

## 현재 상태 (코드·문서 근거)

- **방문 수집 파이프라인이 이미 있다.** 앱 로드당 1회 `components/VisitPing.tsx:59-98`가
  `/api/visit`에 POST(localStorage 일자 dedupe) → 서버가 device_id 쿠키 발급 +
  `page_visits`에 (visit_date, device_id) 멱등 upsert(`app/api/visit/route.ts:65-111`,
  `lib/db/stats.ts:41-70`).
- **서버는 이미 접속 IP를 본다.** `app/api/visit/route.ts:35-42`의 `clientIp()`가
  `x-forwarded-for` 첫 값 → `x-real-ip` 순으로 파싱해 rate limit에 사용 중(`:91-92`).
  단, **IP는 저장하지 않는다** — `supabase/migrations/0029_page_visits.sql:10-13`에
  "IP/User-Agent/그 외 식별정보는 저장하지 않는다"가 정책 주석으로 명시.
- **page_visits 스키마** (`0029_page_visits.sql:18-33` + `0034_visit_channels_retention.sql:22-30`):
  `visit_date date · device_id text · user_id uuid? · first_seen_at · ref_host? · utm_source? ·
  utm_medium? · utm_campaign?`. 인덱스: `(visit_date, device_id)` unique, `(visit_date)`,
  `(device_id, visit_date)`. RLS off(서버 전용).
- **지역 코드 체계가 이미 있다.** `types/station.ts:45-54` `SidoCode`('01'~'19') + `SIDO_NAME`,
  시군구는 `lib/sigungu-data.ts`(Opinet AREA_CD 4자리, 1,069줄 정적 매핑) + `lib/regions.ts`.
- **관리자 대시보드 패턴**: `app/admin/page.tsx:204-206` `getAdminOrNull()`(→`lib/auth/admin.ts:37-43`,
  ADMIN_EMAILS 게이트) 실패 시 `notFound()`, `:23-26` noindex, `:28-29` force-dynamic,
  `:68-90` Supabase 미설정 시 전 카드 '-' 폴백, `:226-244` 카드 그리드. 집계 함수는
  `lib/db/stats.ts`의 RPC 래퍼 패턴(`getTodayChannels` `:192-204` — 실패 시 null → '-').
- **지도 SDK**: `types/kakao.d.ts`에는 `CustomOverlay`(:64)·`Circle`(:92)만 선언, **Polygon 미선언**
  (카카오 SDK 자체는 `kakao.maps.Polygon` 지원하나 타입·사용 코드 모두 없음). 시도 경계
  GeoJSON도 리포에 없음.
- **클라이언트가 지역 코드를 서버로 보내는 API는 없다.** 지도 조회는 순수 좌표 bbox
  (`app/api/stations/bbox/route.ts:19-29` — swLat/swLng/neLat/neLng/zoom/product/brand만).
- **개인정보처리방침**: `app/legal/privacy/page.tsx:26` "자동 수집: 접속 IP, 접속 로그, …" +
  제2조에 "유입 경로·이용 행태 통계 분석" 목적 명시. 0034 때도 방침을 함께 갱신한 전례
  (커밋 `f9d5d93` "docs: 개인정보처리방침에 유입 채널(referrer 호스트·UTM)·행동 로그 수집 항목 반영").
- **금지 소스 확인**: `0024_user_location_and_price_trend.sql:14-15`(users.last_lat/lng — 정책 3으로
  재사용 금지), `0005_interest_regions.sql:11-12`(interest_regions.lat/lng — 푸시 목적의 정밀 좌표라
  역시 목적 외 이용 불가).
- **배포 런타임**: Firebase App Hosting(Cloud Run 기반), `apphosting.yaml` `runConfig.memoryMiB: 512`
  — GeoIP DB 상주 메모리에 직접적인 제약.

## 문제/기회

- 운영자는 현재 "오늘 방문자수·채널·퍼널"은 보지만 **어느 지역 사용자가 오는지 전혀 모른다.**
  지역별 수요를 모르면 SEO 지역 랜딩(211개 시군구 페이지, 커밋 `4e07d50`)·SNS 발행(`/admin/daily-top10`)·
  마케팅 타겟팅이 감으로 이뤄진다.
- 방문 파이프라인·지역 코드 체계·관리자 대시보드가 모두 갖춰져 있어 **추가 조각은
  "IP→시도 변환 + 컬럼 1개 + 집계 카드"뿐** — 한계비용이 낮은 기회다.
- 최종 사용자(운전자) 편익은 간접적(운영 판단 개선)이므로, 구현 비용을 반나절 수준으로
  묶는 것이 타당하다.

## 외부 사례·동향

- 오피넷·티맵·캐시닥 등 경쟁 서비스는 접속 지역 분석을 외부에 노출하지 않는다(내부 운영 지표
  영역). 일반적인 해법은 **GA4 지역 리포트**(코드 0줄)이나, 본 서비스는 GA 없이 자체 계측 노선
  (`lib/analytics.ts` → `/api/event` → funnel_events)을 택했고, GA 도입은 외부 전송·쿠키 고지 등
  방침 부담이 커서 기존 노선 유지가 자연스럽다.
- Firebase App Hosting에서의 클라이언트 IP: App Hosting은 CDN·LB·Cloud Run 프록시를 거치며
  XFF가 불안정해, **Firebase가 전용 헤더 `x-fah-client-ip`를 제공**한다(Firebase 지원팀이 클라이언트
  IP임을 확인, 출처: [Arcjet 블로그](https://blog.arcjet.com/detecting-client-ips-on-firebase/)).
  현 `clientIp()`(`app/api/visit/route.ts:35-42`)는 XFF 첫 값만 보므로 **`x-fah-client-ip` 우선 조회
  추가가 필요**하다(XFF 첫 값은 클라이언트가 위조 가능 — rate limit 용도론 무방했지만 통계 소스로는
  전용 헤더가 안전).
- 한국 특이사항(가설, 업계에서 널리 알려진 현상): **이동통신망(SKT/KT/LGU+) IP는 게이트웨이 위치
  (수도권)로 잡히는 경우가 많아** 모바일 우선 서비스에서 IP 지역 통계는 서울/경기로 편중될 수 있다.
  절대값이 아닌 추이·상대 비교 지표로 쓰고, 대시보드에 한계 라벨을 달아야 한다(기존 D1/D7 카드의
  "절대값보다 추이 참고" hint 전례 — `app/admin/page.tsx:177-178`).

## A. 지역 추정 소스 비교

| 선택지 | 의미론(주제 적합) | 정책 적합성 | 정확도 | 구현 비용 | 신규 저장 데이터 |
|---|---|---|---|---|---|
| **(a) 서버 IP→GeoIP (추천)** | "어느 지역에서 접속" — 주제와 정확히 일치 | 적합: IP 자동수집은 방침 기수록, IP 원본은 저장 안 함(시도 코드만) | 시도 단위 중간(60~70%대 추정, 모바일 통신사 IP 편중 리스크) | 중: GeoIP DB 도입 + 컬럼 1개 + 매핑 표 | `page_visits.sido_code`(text, nullable)만 |
| (b) 지도 뷰포트 중심의 지역코드 | **부적합**: "사용자가 보고 있는 지역"이지 접속 위치가 아님. 타지역 시세 구경·경로 탐색 시 왜곡 | 경계선: 현위치 버튼 사용 시 뷰포트≈GPS 위치가 되어 정책 3(GPS 목적 외 이용 금지) 취지와 충돌 소지 | 접속 위치 지표로는 낮음 | 중: 현재 어떤 API도 지역코드를 전송하지 않음(`bbox`는 좌표만) → 신규 전송 설계 필요 | 시도 코드 |
| (c-1) interest_regions(관심 지역) | 부적합: 집/회사 등록 좌표(로그인+설정 사용자만, 커버리지 극소) | 부적합: 푸시 목적 정밀 좌표의 목적 외 이용(정책 3과 동일 논리) | — | — | — |
| (c-2) 가입 시 지역 입력 신설 | "거주 지역"(≠접속 지역) | 적합하나 신규 수집 마찰(가입 전환율 훼손) | 자기 신고 | 중: 가입 UI 변경 | users.region |
| (c-3) 없음(현상 유지) | — | — | — | 0 | 0 |

### GeoIP 구현 방식 세부 비교 ((a) 내부)

| 방식 | 라이선스/비용 | 한국 시도 정확도 | App Hosting 실현성 | 비고 |
|---|---|---|---|---|
| **MaxMind GeoLite2-City (mmdb, 추천)** | 무료. 계정+라이선스 키로 다운로드, [EULA](https://www.maxmind.com/en/geolite-free-ip-geolocation-data)·attribution 요구 | subdivision(ISO 3166-2:KR) 제공 — 시도 매핑 가능. GeoLite2 정확도는 유료 GeoIP2보다 다소 낮음(공개 벤치마크 기준 60%대) | 가능: `maxmind` npm(순수 JS 리더) + 빌드 시 mmdb 다운로드(시크릿 `MAXMIND_LICENSE_KEY`). **DB ~60MB 메모리 상주 ↔ memoryMiB 512 제약** → lazy-load + 메모리 실측 필요 | 사실상 표준. 실패 시 sido_code NULL로 graceful |
| IP2Location LITE DB3 | 무료(상업 이용 가능, [attribution 필수](https://lite.ip2location.com/), 계정 필요) | region 컬럼 제공(영문명 → 시도 매핑 필요) | 가능(BIN + `ip2location-nodejs`), 메모리 부담 유사 | GeoLite2 대안. 매핑이 코드(ISO)가 아닌 영문명 기반이라 다소 취약 |
| ip-api.com (외부 API) | **탈락**: [무료는 상업 이용 금지 + HTTPS 미지원](https://ip-api.com/), 분당 45회 | — | — | 광고·유료플랜 있는 본 서비스는 상업적 이용 |
| ipinfo Lite (외부 API) | 무료 무제한이나 **국가 수준만**([시도는 유료 $49/mo~](https://ipinfo.io/blog/best-ip-geolocation-api)) | 탈락(시도 불가) | — | |
| KR 전용 압축 테이블 자체 생성 | GeoLite2 CSV에서 KR 대역만 추출(수 MB) → 리포 커밋 | GeoLite2와 동일 | **메모리 최소** — 512MiB 제약에 가장 안전 | 추출 스크립트(scripts/) 개발 비용 추가. v1에서 메모리 실측 실패 시의 플랜 B |

**추천: (a) MaxMind GeoLite2-City + `page_visits.sido_code` 저장.**
- 주제("어느 지역에서 접속")와 유일하게 일치하고, IP는 방침에 이미 수집 항목으로 명시되어 있으며
  (privacy `:26`), 변환 결과인 시도 코드만 저장하므로 0029의 "IP 미저장" 원칙도 유지된다.
- **시군구 단위는 v1에서 제외 권장**: GeoIP의 한국 도시 단위 정확도는 신뢰하기 어렵고(통신사 IP
  편중), 시도 17개만으로도 운영 판단(어느 지역 랜딩/마케팅에 투자할지)에 충분하다. 정책상 시군구까지
  허용되지만 "허용 상한"이지 요구가 아니다.
- IP 헤더: `x-fah-client-ip` → `x-forwarded-for` 첫 값 → `x-real-ip` 순 폴백으로 `clientIp()` 확장.

## B. 기존 인프라 재사용 매핑

| 재사용 대상 | 위치 | 이번 작업에서의 역할 |
|---|---|---|
| IP 추출 헬퍼 | `app/api/visit/route.ts:35-42` | `x-fah-client-ip` 우선 조회 추가 후 GeoIP 입력으로 재사용 |
| 방문 upsert + 컬럼 부재 fallback 패턴 | `lib/db/stats.ts:41-70` | `sido_code`를 channel과 동일하게 optional 필드로 추가(0035 미적용 창에서도 방문 유실 없음) |
| 컬럼 추가 마이그레이션 전례 | `0034_visit_channels_retention.sql:22-30` | 0035의 형식 그대로(add column if not exists + 인덱스) |
| 집계 RPC 패턴 | `0034 …sql:95-104` `visit_channels(d)` | `visit_regions(d, days)` RPC를 같은 형태로 |
| RPC 래퍼(null → '-') | `lib/db/stats.ts:192-204` | `getRegionVisits()` 신설 시 동일 패턴 |
| 관리자 게이트/레이아웃 | `app/admin/page.tsx:204-206, 23-29, 226-244` · `lib/auth/admin.ts:37-43` | 신규 섹션(또는 `/admin/regions` 도구 페이지)에 그대로 적용, noindex 유지 |
| 시도 코드·이름 | `types/station.ts:45-54` | GeoIP subdivision → `SidoCode` 매핑 표의 값 타입, 표시는 `SIDO_NAME` |
| 시군구 매핑(v2 대비) | `lib/sigungu-data.ts`, `lib/regions.ts` | v1 미사용, 시군구 확장 시 재사용 |
| Mock 폴백 관례 | `app/admin/page.tsx:68-90`, `lib/db/supabase.ts` `isSupabaseConfigured()` | 아래 Mock 전략 |

카카오맵 SDK: `types/kakao.d.ts`에 Polygon 미선언·미사용. 관리자 1인용 화면에 클라이언트 SDK 로딩
+타입 확장+경계 GeoJSON 런타임 로딩을 들이는 것은 비용 대비 과함(아래 시각화 추천 참조).

## 스키마 변경 제안 (마이그레이션 0035)

```sql
-- 0035: page_visits에 접속 지역(시도) 컬럼 + 지역별 방문 집계 RPC
-- 개인정보: IP 원본은 저장하지 않는다(0029 원칙 유지). GeoIP 변환 결과인
-- Opinet 시도 코드('01'~'19')만 남기고, 실패/미상은 NULL.
alter table page_visits add column if not exists sido_code text;

-- 기간×지역 집계 최적화
create index if not exists page_visits_date_sido_idx on page_visits (visit_date, sido_code);

-- 최근 days일 시도별 고유 방문(행 자체가 일×디바이스 유니크라 count(*)면 됨)
create or replace function visit_regions(days int default 7)
returns table(sido_code text, visits bigint)
language sql stable as $$
  with kst as (select (now() at time zone 'Asia/Seoul')::date as today)
  select v.sido_code, count(*) as visits
  from page_visits v, kst
  where v.visit_date > kst.today - days and v.sido_code is not null
  group by 1 order by visits desc;
$$;
```

- first-touch 의미론은 0034 채널과 동일(하루 첫 방문의 접속 지역만 기록 — ignoreDuplicates).
- `recordVisit()`에 `sido_code?: string | null` 추가, channel과 같은 "실패 시 필드 제외 재시도"
  fallback(`lib/db/stats.ts:36-39` 주석의 배포 안전성 로직) 적용.

## 시각화 방식 추천 (지도 vs 표)

- **v1(이번 사이클): 시도 17개 정적 SVG 단계구분도 + 수치 표(순위·방문수) 병기 — 추천.**
  - 시도 단순화 GeoJSON을 빌드 전에 SVG path로 1회 변환해 커밋(런타임 의존성 0, 서버 컴포넌트
    렌더 가능, 관리자 라이트 테마 고정과도 부합). 색 농도는 방문수 분위 기반 4~5단계.
  - 표 병기는 필수: 색 농도만으로는 수치 확인이 어렵고, GeoIP 실패분(NULL)을 '미상' 행으로
    정직하게 노출해야 한다.
  - 반나절 예산이 빠듯하면 v1을 "표 + 가로 막대(색 농도)"로 축소하고 SVG 지도를 v2로 미뤄도
    정책·주제 훼손은 없다(제약 1은 "개인 핀 금지·집계 전용"이 본질).
- 카카오맵 Polygon 방식은 비추천: 타입 선언 추가 + 클라이언트 컴포넌트 + 경계 GeoJSON 로딩이
  필요하고 관리자 전용 화면에서 얻는 이득이 없다.
- 시도 경계 데이터 후보: [statgarten/maps](https://github.com/statgarten/maps)(통계청 SGIS 기반,
  2020 경계), [southkorea/southkorea-maps](https://github.com/southkorea/southkorea-maps)(KOSTAT
  기반, 구버전), [vuski/admdongkor](https://github.com/vuski/admdongkor). 재배포 라이선스는 아래
  미해결 참조.

## C. Mock 모드 폴백 (SRS §9)

- 수집 측: `NEXT_PUBLIC_USE_MOCK=true`면 `isSupabaseConfigured()`가 false → `recordVisit`이 이미
  no-op(`lib/db/stats.ts:46`) — GeoIP lookup도 같은 가드 뒤에 두면 키·DB 없이 동작(변경 최소).
- 표시 측: `getRegionVisits()`가 Mock에서 **고정 목 집계**(예: 서울 120·경기 95·부산 40…17개 시도
  전체, `lib/mock/` 관례)를 반환하게 하여 단계구분도·표 UI를 외부 키 없이 개발·검증 가능하게 한다.
  기존 카드들이 '-'인 것과 달리 지도는 데이터 없이는 검증 자체가 불가하므로 목 데이터 반환이 낫다
  (카드 '-' 관례와 다른 선택임을 주석으로 명시).
- GeoLite2 mmdb가 빌드에 없을 때(로컬·CI): lookup 모듈이 null 반환 → sido_code NULL 저장 →
  대시보드 '미상' 집계. 빌드는 실패하지 않아야 한다.

## 개선 방향 제안 (2~3개)

1. **[추천] IP→시도 집계 + /admin 단계구분도 (본 조사의 본안)**
   - 기대 효과: 지역별 수요 가시화 → SEO 지역 랜딩·SNS 발행·마케팅 투자 판단 근거 확보.
   - 예상 비용: 반나절~1일. 0035 마이그레이션 + `clientIp()` 확장 + GeoIP 모듈(lib/geoip/) +
     recordVisit 확장 + stats 래퍼 + admin 섹션(SVG or 표).
2. **축소안: 표·막대만 v1, SVG 지도는 v2** — 예산 초과 시 데이터 파이프라인(0035+GeoIP)만
   이번에 넣고 시각화는 표로. 데이터는 쌓이기 시작해야 가치가 생기므로 파이프라인 우선이 합리적.
3. **보완(선택): '미상' 비율 카드** — GeoIP 실패율을 함께 노출해 통계 신뢰도를 운영자가 항상
   인지하게 함(모바일 IP 편중 한계 라벨과 세트).

## 미해결 질문/리스크

1. **`x-fah-client-ip` 실측 미완**: Arcjet 블로그 근거이며 Firebase 공식 문서에서 헤더 보장을
   확인하지 못했다. 배포 환경에서 실제 헤더 값 로깅(1회성 검증)으로 확정 필요. 폴백(XFF 첫 값)은
   위조 가능성이 있으나 통계 용도라 치명적이진 않음.
2. **메모리 제약**: GeoLite2-City mmdb(~60MB)를 `memoryMiB: 512` 인스턴스에 상주시켰을 때 OOM
   여부 실측 필요. 위험하면 플랜 B(KR 전용 압축 테이블 추출 스크립트) 또는 memoryMiB 상향.
3. **모바일 통신사 IP 편중(가설)**: 한국 이동통신 IP가 수도권 게이트웨이로 잡히는 정도를 정량
   확인하지 못했다. 배포 후 '미상'·서울 비중을 보고 판단, 대시보드에 한계 hint 필수.
4. **ISO 3166-2:KR 코드 최신성**: 강원(KR-42→KR-51, 2023)·전북(KR-45→KR-55, 2024) 특별자치도
   개편으로 GeoLite2가 신·구 어느 코드를 주는지 구현 시 실측 필요. 매핑 표에 신구 코드 모두 수록
   권장(17+α 엔트리, 비용 미미).
5. **GeoLite2 EULA 준수 방식**: attribution 문구("This product includes GeoLite2 data created by
   MaxMind")를 관리자 화면 하단에 두는 것으로 충분한지, DB 갱신 주기(빌드 시 다운로드라 재배포마다
   갱신됨 — 배포가 뜸하면 구버전 사용) 요건 해석 확인 필요.
6. **시도 경계 SVG의 원천 라이선스**: statgarten/maps 등 통계청 SGIS 파생물의 재배포·가공 조건
   (공공누리 유형) 미확인. 관리자 내부 화면이라 위험은 낮으나 리포 커밋 전 확인 필요.
7. **방침 문구 판단(정책 제약 5)**: 기존 "접속 IP 자동수집 + 통계 분석 목적"으로 지역 코드 파생
   집계는 해석상 커버 가능하다고 판단. 다만 0034 전례(f9d5d93)대로 제1조 자동수집 항목에
   "접속 IP로부터 추정한 접속 지역(시도 단위, IP 원본은 저장하지 않음)" 한 줄 추가를 권장 —
   필수는 아니나 저비용·전례 부합.
8. **봇 트래픽 혼입**: 0029 주석(`:12-13`)대로 봇 필터가 없어 지역 통계에 데이터센터 IP(GeoIP상
   특정 지역 편중)가 섞일 수 있다. GeoIP DB의 hosting/proxy 플래그 활용은 범위 밖으로 남김.
