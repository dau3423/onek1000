-- 0029: 방문자 수 집계용 page_visits 테이블
--
-- 배경(정책 확정):
--   관리자 대시보드 "오늘 방문자수(KST)" 카드를 위해 디바이스 기준 고유 방문을 기록한다.
--   - 방문 1행 = "이 디바이스가 이 날짜에 방문". 하루 1디바이스 1행(KST 자정 경계).
--   - device_id: 클라이언트 쿠키에 발급되는 무작위 UUID(crypto.randomUUID). 식별정보 아님.
--   - user_id: 로그인 시에만 채운다(연관 분석용, NULL 허용). 단, 방문자 카운트 기준은
--     어디까지나 device_id다(로그인/비로그인 모두 디바이스 단위로 1회 dedupe).
--
-- 개인정보:
--   - 무작위 UUID(device_id)와 visit_date만 저장한다. IP/User-Agent/그 외 식별정보는 저장하지 않는다.
--   - 비로그인 디바이스도 카운트되므로 봇/프리렌더 트래픽이 혼입될 수 있다(1차 단순 구현,
--     봇 차단은 범위 밖). 정밀 분석이 필요하면 추후 차단/필터 로직을 별도로 추가한다.
--
-- 멱등: create table if not exists / create index if not exists 라 재적용 안전.

-- ─── 1) 방문 로그 테이블 ───
create table if not exists page_visits (
  visit_date    date not null,                       -- KST 기준 방문 날짜(YYYY-MM-DD)
  device_id     text not null,                        -- 쿠키 기반 영속 UUID(무작위)
  user_id       uuid,                                 -- 로그인 시 사용자 id(없으면 NULL)
  first_seen_at timestamptz not null default now()    -- 해당 날짜 첫 방문 기록 시각
);

-- ─── 2) 하루 1디바이스 1행 보장(upsert onConflict 대상) ───
-- 같은 날짜에 같은 디바이스가 여러 번 와도 행은 1개. 방문 ping은 멱등한 no-op 업서트가 된다.
create unique index if not exists page_visits_date_device_uidx
  on page_visits (visit_date, device_id);

-- ─── 3) 오늘 방문자 집계 최적화 ───
-- visit_date = '오늘'인 행 수를 빠르게 센다.
create index if not exists page_visits_date_idx
  on page_visits (visit_date);

-- ─── 4) RLS ───
-- 기존 사용자 데이터 테이블(reviews/vehicles/fuel_logs)과 동일하게 서버(service_role)에서만
-- 접근하므로 RLS는 비활성화한다. (alter ... disable은 멱등 — 재적용 안전)
alter table page_visits disable row level security;
