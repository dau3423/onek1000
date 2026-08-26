-- 0053: 세차 지수 알림 — 옵트인 설정 + 발송 dedupe
--
-- 배경: carwash_index(0037)에 시도×일자 세차 지수가 매일 적재된다(sync-weather).
--   지수가 'good' 인 날 아침, 옵트인한 푸시 구독자에게 "오늘 세차하기 좋아요"를 보낸다.
--   0027(주유 타이밍 알림)과 같은 구조 — 옵트인 플래그 + 발송 로그(dedupe).
--
-- ⚠️ 지역 판정의 한계: 세차 지수는 시도 단위인데 사용자 위치를 직접 저장하지 않는다.
--   관심지역(interest_regions.lat/lng)을 우선 쓰고, 없으면 최근 방문 시도(page_visits.sido_code)
--   로 폴백한다. 후자는 GeoLite2 IP 기반이라 부정확할 수 있어(모바일 통신사는 서울로 잡히는
--   경우가 흔하다) **알림 본문에 판정 지역을 명시**해 사용자가 즉시 알아채게 한다.
--
-- 멱등: add column if not exists / create table if not exists 라 재적용 안전.

-- ─── 1) 옵트인 플래그 ───
-- 마이페이지 알림 설정의 "세차 지수 알림" 토글이 저장되는 곳.
-- 기본값 false: 사용자가 명시적으로 켠 경우에만 발송한다(0027 과 동일한 보수적 옵트인).
alter table users add column if not exists carwash_notify_opt_in boolean not null default false;

-- ─── 2) 발송 이력(dedupe) ───
-- 1행 = "이 사용자에게, 이 시도의, 이 날짜 세차 지수를 발송했다".
--   - 세차하기 좋은 날은 연달아 이어지기 쉬워(맑은 날이 며칠씩 계속) 매일 보내면 스팸이 된다.
--     발송 잡은 "직전 발송이 N일 이내면 skip" 판정에 이 테이블의 최신 발송 시각을 쓴다
--     (상세 로직은 lib/carwash/notify.ts).
--   - date 를 함께 기록해 같은 날 중복 발송을 구분할 수 있게 한다.
create table if not exists carwash_notify_log (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references users(id) on delete cascade,
  region    text not null,                 -- 발송 기준 시도 코드('01'.. — carwash_index.region 과 동일 체계)
  date      date not null,                 -- 발송 근거가 된 세차 지수의 대상일(KST)
  grade     text not null,                 -- 발송 시 등급(항상 'good' 이지만 기록 보존)
  score     int  not null default 0,       -- 발송 시 점수(0~100) — 사후 점검용
  sent_at   timestamptz not null default now()
);

-- "이 사용자의 최근 발송"을 빠르게 찾기 위한 인덱스(dedupe 판정 핵심 경로).
create index if not exists carwash_notify_log_user_sent_idx
  on carwash_notify_log (user_id, sent_at desc);
