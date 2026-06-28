-- 0033: 전환 퍼널 분석용 funnel_events 테이블 + 집계 RPC
--
-- 목적: "방문 → 로그인 화면 → 가입 시도 → 가입 성공" 어디서 이탈하는지,
--       그리고 가입자가 다시 돌아오는지(리텐션)를 보기 위한 최소 이벤트 로깅.
--
-- page_visits(0029)와 동일 정책:
--   - device_id: onek_did 쿠키의 무작위 UUID(식별정보 아님). user_id는 로그인 시에만.
--   - visit_date(KST)를 서버에서 계산해 저장 → 날짜 그룹 집계가 타임존 함수 없이 단순해진다.
--   - 서버(service_role) 전용 접근이라 RLS 비활성화.
--   - props: 이벤트별 부가정보(jsonb, 예: {"provider":"kakao","inApp":true,"mode":"signup"}).
--
-- 멱등: create ... if not exists / create or replace 라 재적용 안전.

create table if not exists funnel_events (
  id         bigserial primary key,
  event      text not null,          -- signin_view / oauth_click / email_submit / signup_success / auth_success ...
  device_id  text not null,
  user_id    uuid,
  props      jsonb,
  visit_date date not null,          -- KST 기준(YYYY-MM-DD) — 일자별 퍼널 집계용
  created_at timestamptz not null default now()
);

-- 일자+이벤트별 집계 최적화
create index if not exists funnel_events_date_event_idx on funnel_events (visit_date, event);
-- 디바이스/사용자 단위 조회
create index if not exists funnel_events_device_idx on funnel_events (device_id);
create index if not exists funnel_events_user_idx on funnel_events (user_id) where user_id is not null;

alter table funnel_events disable row level security;

-- ─── 집계 RPC ───

-- 특정 날짜(KST)의 이벤트별 "고유 디바이스 수". 퍼널 단계별 폭을 본다.
create or replace function funnel_counts(d date)
returns table(event text, devices bigint)
language sql stable as $$
  select event, count(distinct device_id) as devices
  from funnel_events
  where visit_date = d
  group by event;
$$;

-- 리텐션 프록시: 서로 다른 날짜에 2회 이상 방문한 "로그인 사용자" 수.
-- (page_visits 기준 — 가입자가 다시 돌아오는지의 1차 지표)
create or replace function returning_user_count()
returns bigint
language sql stable as $$
  select count(*) from (
    select user_id
    from page_visits
    where user_id is not null
    group by user_id
    having count(distinct visit_date) >= 2
  ) t;
$$;

-- 비교용: page_visits에 한 번이라도 잡힌 고유 로그인 사용자 수.
create or replace function signed_in_user_count()
returns bigint
language sql stable as $$
  select count(distinct user_id) from page_visits where user_id is not null;
$$;
