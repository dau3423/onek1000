-- 0005: 관심 지역 (집/회사 등 고정 좌표) + 지역 최저가 TOP10 변동 푸시
-- 웹은 백그라운드 위치 추적이 불가하므로, 사용자가 등록한 고정 좌표 반경 내
-- 최저가 TOP10 변동을 cron이 감지해 Web Push로 알린다.
-- (이 앱의 목적은 "가장 저렴한 주유소 찾기"이므로 가격 오름차순 TOP10을 기준으로 한다.)

-- ─── 관심 지역 ───
create table if not exists interest_regions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  name                  text not null,                 -- 예: "집", "회사"
  lat                   double precision not null,
  lng                   double precision not null,
  radius_m              integer not null default 5000, -- 반경(m)
  product               text not null default 'B027',  -- 유종 코드
  -- 푸시 스팸 방지용 직전 통지 상태 (TOP10 기준)
  last_notified_price       integer,                   -- 직전 통지 시점의 최저가(1위)
  last_notified_station_id  text,                      -- 직전 통지 시점의 1위 주유소 id
  last_notified_station_ids text[],                    -- 직전 통지 시점의 TOP10 주유소 id 집합
  last_notified_at          timestamptz,
  created_at            timestamptz default now()
);

create index if not exists interest_regions_user_idx on interest_regions (user_id);

alter table interest_regions disable row level security;

-- 기존 0005를 적용한 환경을 위한 멱등 보강 (재적용 안전)
alter table interest_regions add column if not exists last_notified_station_ids text[];

-- 사용자당 관심 지역 최대 5개 제한 (애플리케이션에서도 검증하되 DB에서도 방어)
create or replace function trg_interest_regions_limit()
returns trigger language plpgsql as $$
declare
  cnt int;
begin
  select count(*) into cnt from interest_regions where user_id = new.user_id;
  if cnt >= 5 then
    raise exception 'interest region limit exceeded (max 5)';
  end if;
  return new;
end;
$$;

drop trigger if exists interest_regions_limit on interest_regions;
create trigger interest_regions_limit
  before insert on interest_regions
  for each row execute function trg_interest_regions_limit();

-- ─── RPC: 반경 내 해당 유종 최저가 TOP10 (가격 오름차순) ───
-- 이 앱의 목적은 "가장 저렴한 주유소"이므로 가격 오름차순 상위 10건을 반환한다.
-- cron은 1위(최저가) 하락 또는 TOP10 구성 변화를 감지해 푸시한다.
create or replace function rpc_region_top10(
  p_lat float8, p_lng float8, p_radius_m int, p_product text
)
returns table (
  station_id text, station_name text, price int, rank int
) language sql stable as $$
  select s.id, s.name, p.price,
         row_number() over (
           order by p.price asc,
                    st_distance(s.geom, st_makepoint(p_lng, p_lat)::geography) asc
         )::int as rank
  from stations s
  join prices_latest p on p.station_id = s.id
  where p.product = p_product
    and st_dwithin(s.geom, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
  order by p.price asc,
           st_distance(s.geom, st_makepoint(p_lng, p_lat)::geography) asc
  limit 10;
$$;

-- 하위호환: 기존 1위만 반환하던 RPC도 유지(다른 호출부가 있을 경우 대비)
create or replace function rpc_region_lowest(
  p_lat float8, p_lng float8, p_radius_m int, p_product text
)
returns table (
  station_id text, station_name text, price int
) language sql stable as $$
  select station_id, station_name, price
  from rpc_region_top10(p_lat, p_lng, p_radius_m, p_product)
  where rank = 1;
$$;
