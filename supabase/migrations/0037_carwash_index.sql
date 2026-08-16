-- 0037: 세차 지수(시도×일자) — /api/internal/sync-weather 가 1일 1회 적재.
--
-- 출처: 기상청 단기예보(강수확률 POP), 에어코리아 미세먼지 예보(등급, 결측 허용).
-- 근사·참고용 지수 — 산출식은 lib/weather/kma.ts 참조(단정 표현 금지, 확률/등급만).
--
-- 프로덕션 적용: **이 마이그레이션은 운영자가 수동 실행한다**(이번 배포 범위 아님).
--   테이블 미존재 시 조회 API(/api/carwash-index)는 mock/폴백으로 동작하고,
--   sync-weather 는 upsert 실패를 부분 오류로 보고할 뿐 앱을 깨지 않는다.
create table if not exists carwash_index (
  date        date not null,            -- 대상일(KST)
  region      text not null,            -- 시도 코드(stations.sido_code 체계 '01'.. 와 동일)
  score       int  not null,            -- 0~100
  grade       text not null,            -- 'good' | 'fair' | 'bad'
  pop_max     int,                      -- 당일 최대 강수확률(%)
  pop_next    int,                      -- 익일 최대 강수확률(%) — 감점 근거 표기용
  dust_grade  text,                     -- 미세먼지 예보 등급(좋음/보통/나쁨/매우나쁨, null=결측)
  updated_at  timestamptz not null default now(),
  primary key (date, region)
);
create index if not exists carwash_index_region_date_idx
  on carwash_index (region, date desc);
alter table carwash_index disable row level security;  -- 서버(service_role) 전용
