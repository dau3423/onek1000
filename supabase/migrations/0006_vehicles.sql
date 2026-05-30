-- 0006: 내 차량 등록 → 기름 종류(유종) 저장 → 앱 기본 유종 자동 선택
-- 로그인 사용자가 차량(연료 종류)을 등록하면, 기본 차량의 유종을 지도/필터의
-- 기본값으로 자동 선택한다. 비로그인/미등록 시 기존 B027(휘발유)을 유지한다.

create table if not exists vehicles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  name        text not null,                 -- 예: "내 차"
  fuel        text not null default 'B027',  -- 유종 코드(ProductCode)
  is_default  boolean not null default false,
  created_at  timestamptz default now()
);

create index if not exists vehicles_user_idx on vehicles (user_id);

-- 사용자당 기본 차량은 1대만 (is_default=true 행이 사용자별 최대 1개)
create unique index if not exists vehicles_one_default_idx
  on vehicles (user_id) where is_default;

alter table vehicles disable row level security;

-- 사용자당 차량 최대 5대 제한 (애플리케이션에서도 검증하되 DB에서도 방어)
create or replace function trg_vehicles_limit()
returns trigger language plpgsql as $$
declare
  cnt int;
begin
  select count(*) into cnt from vehicles where user_id = new.user_id;
  if cnt >= 5 then
    raise exception 'vehicle limit exceeded (max 5)';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_limit on vehicles;
create trigger vehicles_limit
  before insert on vehicles
  for each row execute function trg_vehicles_limit();
