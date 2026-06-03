-- 1000냥 주유소 - EV 충전소 sync 페이지 커서(resume) 상태 테이블
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 배경: data.go.kr EvCharger /getChargerInfo 는 페이지당 16~19초로 느려, 서울(~75k/51페이지) 같은
--       대형 시도는 한 번의 sync 호출(시간예산 220s, Cloud Run 300s) 안에 전 페이지를 못 받는다.
--       기존 resume은 zcode 단위(오래된 시도 먼저)뿐이라 "시도 내부는 매 호출 page 1부터" 다시 시작 →
--       대형 시도는 앞쪽 페이지만 반복 적재되고 뒤쪽은 영원히 미수신.
--
-- 해결: zcode별로 "다음에 받을 페이지(next_page)"를 영속화해, 중단된 페이지부터 이어받게 한다.
--       cycle(한 바퀴)을 다 받은 zcode만 stale cleanup 자격을 부여(부분 수신 zcode는 과삭제 금지).
--
-- 폴백: 이 테이블이 없으면 sync-ev 는 기존처럼 page 1부터 시작(대형 시도 미완 가능 — 적용 권장).

create table if not exists ev_sync_state (
  zcode            text primary key,            -- 시도 코드(2)
  next_page        int not null default 1,      -- 다음 호출에서 받을 페이지(1=cycle 처음부터)
  total_count      int,                         -- 마지막 페이지 조회에서 확인한 totalCount
  cycle_started_at timestamptz,                 -- 이번 한 바퀴(cycle)를 시작한 시각(= 이 cycle의 synced_at 하한)
  updated_at       timestamptz not null default now()
);

-- 진행 중(next_page>1)인 zcode를 우선 선정하기 위한 인덱스(소규모 테이블이라 사실상 옵션).
create index if not exists ev_sync_state_next_page_idx on ev_sync_state (next_page);
