-- 0026: 주유 타이밍 예측 결과 저장 + 정확도(hit-rate) 추적
--
-- 배경(주유 타이밍 예측 2단계 — 예측 모델 v1):
--   1단계(0025)에서 적재한 시장 선행지표(market_daily) + 국내 전국평균 소매가
--   (domestic_price_daily)를 입력으로, 설명가능한 1차 모델이 "향후 horizon(기본 14일)
--   국내 소매가 방향성(up/flat/down)"을 매일 산출한다. 그 결과를 여기 저장하고,
--   target_date 가 지나면 실제 변화 방향과 비교해 적중 여부(hit)를 누적한다.
--
--   모델 근거(실데이터 10.4년 검증): 국내 소매가는 원화환산 싱가포르 제품가에 약 2주
--   후행(시차상관 피크 lag≈14일, +0.36), 총 전가 탄력성 Σβ≈0.22, 90% 전가 ~31일.
--   세부 로직/상수는 lib/forecast/ 참조(model_version 에 파라미터 셋을 식별).
--
-- 멱등: 두 테이블 모두 자연키 unique + upsert(on conflict do update)로, 같은 날 배치를
--   여러 번 돌리거나 백필을 재실행해도 중복이 쌓이지 않는다(예측은 덮어쓰기).

-- ─── 예측 결과(1행 = 특정 forecast_date 시점에 낸 (유종·지역) 1건의 예측) ───
-- direction      : 향후 horizon_days 동안의 국내 소매가 방향성. up/flat/down.
-- confidence     : 신호 강도를 과거 변동성 대비 z-score로 0~100(%)에 매핑한 값.
-- horizon_days   : 예측이 바라보는 기간(target_date = forecast_date + horizon_days).
-- model_version  : 사용한 모델/파라미터 식별자(예: 'v1-li14'). 모델 교체 시 병행 비교 가능.
create table if not exists price_forecast (
  id            bigint generated always as identity primary key,
  forecast_date date    not null,                      -- 예측을 낸 기준일(이 시점까지의 데이터만 사용)
  target_date   date    not null,                      -- 방향성을 보는 미래 시점
  region        text    not null default 'nation',     -- 'nation'(전국). 이후 시도 코드로 확장.
  fuel_type     text    not null,                       -- 유종 코드(B027/D047)
  direction     text    not null check (direction in ('up', 'flat', 'down')),
  confidence    numeric not null default 0,             -- 0~100(%)
  horizon_days  int     not null,
  model_version text    not null,
  created_at    timestamptz not null default now(),
  -- 같은 (기준일·지역·유종·모델)이면 1건만 — 재실행 시 덮어쓰기.
  unique (forecast_date, region, fuel_type, model_version)
);

-- 누적 정확도/최근 예측 조회용. (지역·유종·모델별 시간순 스캔)
create index if not exists price_forecast_lookup_idx
  on price_forecast (region, fuel_type, model_version, forecast_date desc);

-- ─── 예측 평가(1행 = 1개 예측의 사후 채점) ───
-- target_date 가 지난 뒤, 그 시점 실제 국내가 변화 방향과 예측 방향을 비교해 hit 기록.
-- actual_direction : 실제로 관측된 방향(up/flat/down, 예측과 동일 데드밴드 기준).
-- actual_change_pct: forecast_date 대비 target_date 의 실제 국내가 변화율(%).
-- hit              : direction == actual_direction 이면 true.
create table if not exists forecast_eval (
  forecast_id       bigint not null references price_forecast(id) on delete cascade,
  actual_direction  text    not null check (actual_direction in ('up', 'flat', 'down')),
  actual_change_pct numeric not null,
  hit               boolean not null,
  evaluated_at      timestamptz not null default now(),
  unique (forecast_id)
);
