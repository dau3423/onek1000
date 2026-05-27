-- 0002: 운영 효율을 위한 보강
-- 1) stations에 lat/lng 분리 컬럼 (geom→좌표 추출 비용 제거)
-- 2) 검색용 인덱스 (name/address ILIKE 가속)
-- 3) 웹 푸시 구독 테이블
-- 4) 경로 최저가용 RPC

-- ─── 1) lat/lng 컬럼 ───
alter table stations
  add column if not exists lat double precision,
  add column if not exists lng double precision;

-- 기존 데이터가 있다면 geom에서 추출하여 채움
update stations
   set lat = st_y(geom::geometry),
       lng = st_x(geom::geometry)
 where lat is null or lng is null;

-- ─── 2) 검색 인덱스 (한글 토큰 분할은 별도이므로 ILIKE + pg_trgm 사용) ───
create extension if not exists pg_trgm;
create index if not exists stations_name_trgm_idx    on stations using gin (name gin_trgm_ops);
create index if not exists stations_address_trgm_idx on stations using gin (address gin_trgm_ops);

-- ─── 3) 웹 푸시 구독 ───
create table if not exists push_subscriptions (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz default now(),
  last_used_at timestamptz,
  unique (user_id, endpoint)
);
create index if not exists push_subs_user_idx on push_subscriptions (user_id);

-- ─── 4) 경로(라인) 근접 최저가 RPC ───
-- 두 점을 잇는 line으로부터 buffer_m 미터 내 주유소 중 product 최저가 TOP N.
create or replace function rpc_stations_along_route(
  p_from_lat float8, p_from_lng float8,
  p_to_lat   float8, p_to_lng   float8,
  p_buffer_m int, p_product text, p_limit int
)
returns table (
  id text, name text, brand_code text, is_self boolean,
  lat float8, lng float8, price int, trade_dt date,
  distance_m float8
) language sql stable as $$
  with line as (
    select st_makeline(
      st_makepoint(p_from_lng, p_from_lat),
      st_makepoint(p_to_lng,   p_to_lat)
    )::geography as g
  )
  select s.id, s.name, s.brand_code, s.is_self,
         coalesce(s.lat, st_y(s.geom::geometry)) as lat,
         coalesce(s.lng, st_x(s.geom::geometry)) as lng,
         p.price, p.trade_dt,
         st_distance(s.geom, line.g) as distance_m
  from stations s
  join prices_latest p on p.station_id = s.id
  cross join line
  where p.product = p_product
    and st_dwithin(s.geom, line.g, p_buffer_m)
  order by p.price asc, distance_m asc
  limit p_limit;
$$;

-- ─── 5) 즐겨찾기 가격 변동 감지 — 직전 가격 대비 ↓ 변동 ───
-- 푸시 발송 시 사용: 어제 가격과 오늘 최저값 비교
create or replace function rpc_recent_price_drops(p_user_id uuid, p_min_drop int default 30)
returns table (
  station_id text, station_name text, product text,
  old_price int, new_price int, diff int
) language sql stable as $$
  with my_favs as (
    select station_id from favorites where user_id = p_user_id
  ),
  latest as (
    select station_id, product, price
    from prices_latest
    where station_id in (select station_id from my_favs)
  ),
  yday as (
    select distinct on (station_id, product)
           station_id, product, price as old_price
    from prices_history
    where station_id in (select station_id from my_favs)
      and observed_at < now() - interval '6 hours'
      and observed_at >= now() - interval '2 days'
    order by station_id, product, observed_at desc
  )
  select s.id, s.name, l.product, y.old_price, l.price, (y.old_price - l.price) as diff
  from latest l
  join yday y on y.station_id = l.station_id and y.product = l.product
  join stations s on s.id = l.station_id
  where (y.old_price - l.price) >= p_min_drop;
$$;
