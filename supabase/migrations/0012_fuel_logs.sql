-- 0011: 내 주유 기록 (1클릭 저장 + 나중 편집)
-- 주유소 상세에서 버튼 한 번으로 {주유소 + 지금 시각 + 그 주유소 현재가 + 내 기본 유종}을
-- 자동으로 채워 즉시 저장한다. 금액/주유량(L)/주행거리/메모는 나중에 기록 목록에서 편집(선택 입력).
-- 단가(unit_price)는 클라이언트 값을 신뢰하지 않고 서버가 우리 DB(prices_latest)에서 조회해 저장한다.
-- (DB에 가격이 없으면 null 허용 → 나중 편집 가능.)

create table if not exists fuel_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  station_id    text not null,                 -- Opinet UNI_ID (stations.id)
  station_name  text not null,                 -- 기록 시점 주유소 상호(스냅샷)
  product       text not null default 'B027',  -- 유종 코드(ProductCode)
  unit_price    integer,                       -- 기록 시점 단가(원/L). 없으면 null
  amount_won    integer,                       -- 결제 금액(원). 나중 편집
  liters        numeric(8,2),                  -- 주유량(L). 나중 편집
  odometer      integer,                       -- 주행거리(km). 나중 편집(연비는 후속)
  memo          text,                          -- 메모. 나중 편집
  logged_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- 목록은 사용자별 최신순으로 조회
create index if not exists fuel_logs_user_logged_idx
  on fuel_logs (user_id, logged_at desc);

-- 기존 테이블(favorites/vehicles/interest_regions)과 동일하게 서버(service_role)에서
-- user_id로 필터링하는 방식이므로 RLS는 비활성화한다.
alter table fuel_logs disable row level security;
