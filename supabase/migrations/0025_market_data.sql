-- 0025: 주유 타이밍 예측용 시장 선행지표 + 국내 소매가 일별 시계열
--
-- 배경(주유 타이밍 예측 1단계 — 데이터 수집):
--   국제유가(원화환산 제품가)가 국내 소매가에 약 2주 후행한다는 시차상관을 실데이터로
--   검증했다(주간 피크 lag≈14일, 상관 +0.36, 90% 전가 ~31일). 예측 모델/신호 API/UI는
--   이후 단계이며, 본 마이그레이션은 그 모델이 학습/추론에 쓸 "선행지표 + 국내가 일별
--   시계열"을 매일 적재하기 위한 스키마만 정의한다.
--
-- 데이터 출처(모두 /api/internal/sync-market 배치가 적재):
--   - 국제 원유(Dubai/Brent/WTI)            : Opinet glopcoil_csv.do
--   - 국제 석유제품(MOPS 프록시: 휘발유/경유) : Opinet glopopd_csv.do
--   - USD/KRW                                : Yahoo Finance chart API
--   - 국내 전국평균 소매가(보통휘발유/경유)   : Opinet dopOsPdrgCsv.do
--
-- 멱등 적재: 두 테이블 모두 자연키 PK + upsert(on conflict do update)로, 후행 정정치를
--   매일 최근 N일 재요청해 덮어쓸 수 있게 한다(배치 재실행/백필이 안전).

-- ─── 시장 선행지표(일별, 1행=1일) ───
-- 모든 가격은 원화환산 전 "원지표" 그대로 적재한다(원유=USD/bbl, MOPS=USD/bbl,
-- usdkrw=원/달러). 원화환산은 예측 단계에서 dubai*usdkrw 식으로 파생한다.
-- 소스별로 결측이 흔하므로(특정일 미발표/주말) 컬럼은 모두 nullable로 둔다.
create table if not exists market_daily (
  date          date primary key,
  dubai         numeric,  -- 두바이유 현물(USD/bbl)
  wti           numeric,  -- WTI(USD/bbl)
  brent         numeric,  -- Brent(USD/bbl)
  mops_gasoline numeric,  -- 싱가포르 현물 휘발유 92RON(USD/bbl) — MOPS 프록시
  mops_diesel   numeric,  -- 싱가포르 현물 경유(USD/bbl) — MOPS 프록시
  usdkrw        numeric,  -- 원/달러 종가
  updated_at    timestamptz not null default now()
);

-- ─── 국내 전국평균 소매가(일별) ───
-- region/fuel_type 차원을 둬 이후 단계의 시도별 적재까지 같은 테이블로 확장한다.
-- 1단계는 region='nation'(전국)만 적재한다. fuel_type 은 우리 기존 유종 코드값을 쓴다
-- (B027=보통휘발유, D047=자동차용경유).
create table if not exists domestic_price_daily (
  date       date    not null,
  region     text    not null,  -- 'nation'(전국). 이후 시도 코드('01'..)로 확장.
  fuel_type  text    not null,  -- 유종 코드(B027/D047 등)
  avg_price  numeric not null,  -- 전국(또는 지역) 평균 소매가(원/L)
  updated_at timestamptz not null default now(),
  primary key (date, region, fuel_type)
);

-- 시계열 기간 스캔(최근 N일/구간 조회)용 보조 인덱스.
create index if not exists domestic_price_daily_region_fuel_date_idx
  on domestic_price_daily (region, fuel_type, date desc);
