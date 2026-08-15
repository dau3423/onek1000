# 운영 절차: GeoIP DB(GeoLite2) 도입 — 관리자 지역별 접속 집계

> 대상: 운영자. 관련 기능: `/admin` "지역별 접속 (최근 7일)" 섹션(FR-3), 수집 파이프라인(FR-2), 마이그레이션 0035(FR-1).
> **코드/기본 배포에는 GeoIP DB가 포함되지 않는다.** DB 도입·적용은 운영자가 아래 절차로 수행한다.

## 개요

- 서버(`/api/visit`)가 접속 IP를 시도 코드(`SidoCode`)로 변환해 `page_visits.sido_code`에 남긴다.
  **IP 원본은 저장·로깅하지 않는다**(0029 원칙). 변환에는 MaxMind GeoLite2-City mmdb 파일이 필요하다.
- GeoIP DB(또는 `MAXMIND_LICENSE_KEY`)가 없어도 앱은 정상 동작한다: 변환 결과가 항상 `null`이 되어
  방문은 지역 없이(=미상) 기록되고, `/api/visit`는 200을 유지한다. 관리자 화면은 Mock/폴백으로 안전하게 렌더된다.

## 사전 조건 — 마이그레이션 0035 적용

1. Supabase 콘솔 → SQL Editor에서 `supabase/migrations/0035_visit_regions.sql`을 실행한다
   (`sido_code` 컬럼 + `(visit_date, sido_code)` 인덱스 + `visit_regions(days)` RPC). 멱등이라 재실행 안전.
2. 0035 적용 전에 코드가 먼저 배포되어도 방문은 유실되지 않는다(`recordVisit`이 컬럼 부재를 감지해
   해당 필드를 제외하고 재시도 — `lib/db/stats.ts`). 다만 0035 적용 전까지 `sido_code`는 채워지지 않는다.

## 절차 — GeoLite2 mmdb 도입

### 1) MaxMind 계정·라이선스 키 발급

- https://www.maxmind.com 에서 무료 계정을 만들고 **GeoLite2 이용 약관에 동의**한다.
- 계정에서 **License Key**를 발급받는다.

### 2) 시크릿 설정

- 배포 환경(예: Firebase App Hosting)에 다음 환경변수를 설정한다.
  - `MAXMIND_LICENSE_KEY` — 다운로드 스크립트 전용(런타임 앱은 사용하지 않음).
  - `GEOIP_DB_PATH`(선택) — mmdb 경로 오버라이드. 미설정 시 기본값 `data/geoip/GeoLite2-City.mmdb`.

### 3) mmdb 다운로드

```bash
MAXMIND_LICENSE_KEY=발급받은키 npm run geoip:download
```

- `data/geoip/GeoLite2-City.mmdb`로 저장된다. 키가 없으면 안내 후 비정상 종료하며, **빌드에는 연결되지 않는다**.

### 4) 배포에 mmdb 포함

- 위 파일을 배포 산출물에 포함하거나, 배포 파이프라인의 빌드 단계 이전에 `geoip:download`를 한 번 실행해
  런타임에서 `GEOIP_DB_PATH` 경로로 읽을 수 있게 한다.
- GeoLite2-City mmdb는 약 60MB다. 서버 메모리 여유(예: `memoryMiB`)를 확인한다. lazy-load(첫 조회 시 1회)로
  완화되어 있으나, OOM 발생 시 메모리 상향 또는 경량 테이블 도입을 검토한다.

### 5) 검증

- 배포 후 `/admin` "지역별 접속" 섹션에서 실제 시도별 집계와 '미상' 비중이 채워지는지 확인한다.
- 최초에는 데이터가 적어 분위 단계가 밋밋할 수 있다(시간이 지나며 구분이 뚜렷해진다).
- `x-fah-client-ip` 헤더가 실제로 수신되는지 1회성으로 점검한다(미수신 시 `x-forwarded-for` 폴백 — 위조 가능성 있음).

## 유의사항

- **개인정보**: 저장은 시도 단위(`sido_code`)까지만. IP 원본·개인 좌표는 저장하지 않는다. 개인정보처리방침
  제1조에 접속 지역(시도 단위) 추정 문구가 반영되어 있다.
- **라이선스(EULA)**: GeoLite2 사용 시 attribution 표기 의무가 있어, 관리자 섹션 하단에
  "This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com"를 표기한다.
- **DB 갱신**: GeoLite2는 주기적으로 갱신된다. 정확도 유지를 위해 배포 시 `geoip:download`로 최신본을 반영하는 것을 권장한다.
- **한계**: 모바일 통신사 IP는 수도권으로 잡히는 경향이 있어 절대값보다 추이로 해석한다(섹션 hint에 상시 고지).
