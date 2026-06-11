-- 0027: 주유 타이밍(가격 인상) 예측 알림 — 옵트인 설정 + 발송 dedupe
--
-- 배경(주유 타이밍 예측 4단계):
--   3단계(0026)까지로 매일 유종별 방향성 예측(price_forecast)이 쌓인다. 4단계에서는
--   오늘자 최신 예측이 direction='up' 이고 신뢰도가 임계치 이상이면, 옵트인한
--   푸시 구독자에게 "향후 N일 상승 전망 — 지금 채우는 게 유리해요" 웹푸시를 보낸다.
--
--   ⚠️ 모델은 horizon(기본 14일) 방향성이라 '내일 인상' 같은 단정/익일 표현은 쓰지 않는다.
--
-- 이 마이그레이션이 담는 것:
--   1) users.forecast_notify_opt_in : 사용자별 수신 동의(기본 false, 보수적 옵트인).
--   2) forecast_notify_log          : 발송 이력(같은 상승 국면에서 매일 반복 발송 방지 dedupe).
--
-- 멱등: add column if not exists / create table if not exists 라 재적용 안전.

-- ─── 1) 옵트인 플래그 ───
-- 마이페이지 알림 설정의 "주유 타이밍(가격 인상) 예측 알림" 토글이 저장되는 곳.
-- 기본값 false: 사용자가 명시적으로 켠 경우에만 발송한다.
alter table users add column if not exists forecast_notify_opt_in boolean not null default false;

-- ─── 2) 발송 이력(dedupe) ───
-- 1행 = "이 사용자에게, 이 유종의, 이 forecast_date 상승 예측을 발송했다".
--   - 같은 상승 국면에서 매일 반복 발송을 막기 위해, 발송 잡은 "직전 발송이 N일 이내면 skip"
--     판정에 이 테이블의 최신 발송 시각을 사용한다(상세 로직은 lib/forecast/notify.ts).
--   - forecast_date 를 같이 기록해 "직전 발송 이후 새 상승 국면(예측 갱신)"을 구분할 수 있게 한다.
create table if not exists forecast_notify_log (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references users(id) on delete cascade,
  fuel_type     text not null,                 -- 발송 기준 유종(B027/D047)
  forecast_date date not null,                 -- 발송 근거가 된 예측의 기준일
  direction     text not null,                 -- 발송 시 방향(항상 'up' 이지만 기록 보존)
  confidence    numeric not null default 0,    -- 발송 시 신뢰도(%) — 사후 점검용
  sent_at       timestamptz not null default now()
);

-- "이 사용자의 최근 발송"을 빠르게 찾기 위한 인덱스(dedupe 판정 핵심 경로).
create index if not exists forecast_notify_log_user_sent_idx
  on forecast_notify_log (user_id, sent_at desc);
