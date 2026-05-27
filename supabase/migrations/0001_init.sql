-- 1000냥 주유소 - 초기 스키마
-- Supabase SQL Editor 또는 supabase db push 로 적용

-- ─── 확장 ───
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ─── 주유소 마스터 ───
create table if not exists stations (
  id              text primary key,
  brand_code      text not null,
  brand_name      text not null,
  name            text not null,
  sido_code       text not null,
  sigungu_code    text,
  address         text,
  zip             text,
  tel             text,
  is_self         boolean default false,
  has_carwash     boolean default false,
  has_cvs         boolean default false,
  has_maintenance boolean default false,
  geom            geography(Point, 4326) not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists stations_geom_idx  on stations using gist (geom);
create index if not exists stations_sido_idx  on stations (sido_code);
create index if not exists stations_brand_idx on stations (brand_code);

-- ─── 가격 최신값 ───
create table if not exists prices_latest (
  station_id text not null references stations(id) on delete cascade,
  product    text not null,                    -- B027/B034/D047/K015/C004
  price      integer not null,
  trade_dt   date not null,
  updated_at timestamptz default now(),
  primary key (station_id, product)
);

create index if not exists prices_latest_pp_idx on prices_latest (product, price);

-- ─── 가격 이력 (베타에서 본격 사용, MVP는 alpha부터 적재) ───
create table if not exists prices_history (
  id          bigserial primary key,
  station_id  text not null,
  product     text not null,
  price       integer not null,
  observed_at timestamptz default now()
);
create index if not exists prices_history_st_pd_at_idx
  on prices_history (station_id, product, observed_at desc);

-- ─── 사용자 (NextAuth는 jwt 전략 사용, users는 자체 동기화) ───
create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  name       text,
  image_url  text,
  provider   text,                              -- kakao/google
  provider_account_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── 구독 ───
create table if not exists subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  status               text not null,           -- trial/active/canceled/expired/past_due
  plan                 text not null default 'monthly_1000',
  billing_key          text,                    -- 토스 자동결제 빌링키 (운영에선 KMS 권장)
  customer_key         text not null,           -- 토스 customerKey (uuid)
  current_period_start timestamptz,
  current_period_end   timestamptz,
  trial_end            timestamptz,
  canceled_at          timestamptz,
  last_payment_at      timestamptz,
  next_charge_at       timestamptz,
  fail_count           int default 0,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
create index if not exists subscriptions_user_idx on subscriptions (user_id);
create index if not exists subscriptions_status_idx on subscriptions (status);
create index if not exists subscriptions_next_charge_idx on subscriptions (next_charge_at)
  where status = 'active';

-- 한 사용자당 active/trial 구독은 1개만
create unique index if not exists subscriptions_one_active_per_user
  on subscriptions (user_id) where status in ('active', 'trial');

-- ─── 결제 이력 ───
create table if not exists billing_events (
  id             bigserial primary key,
  subscription_id uuid references subscriptions(id) on delete set null,
  user_id        uuid references users(id) on delete set null,
  kind           text not null,                 -- subscribe/charge_success/charge_fail/cancel/webhook
  amount         integer,
  toss_payment_key text,
  toss_order_id  text,
  raw            jsonb,
  created_at     timestamptz default now()
);
create index if not exists billing_events_sub_idx on billing_events (subscription_id, created_at desc);

-- ─── 즐겨찾기 ───
create table if not exists favorites (
  user_id    uuid not null references users(id) on delete cascade,
  station_id text not null references stations(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, station_id)
);

-- ─── RLS (필요 시) ───
-- MVP: 서비스 롤로만 접근, RLS는 꺼둠. 클라이언트 직접 접근 도입 시 활성화.
alter table users        disable row level security;
alter table subscriptions disable row level security;
alter table favorites    disable row level security;

-- ─── 헬퍼 RPC: bbox 내 최저가 TOP N ───
create or replace function rpc_stations_by_bbox(
  p_product text,
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int
)
returns table (
  id text, name text, brand_code text, is_self boolean,
  lat float8, lng float8, price int, trade_dt date
) language sql stable as $$
  select s.id, s.name, s.brand_code, s.is_self,
         st_y(s.geom::geometry) as lat,
         st_x(s.geom::geometry) as lng,
         p.price, p.trade_dt
  from stations s
  join prices_latest p on p.station_id = s.id
  where p.product = p_product
    and s.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  order by p.price asc
  limit p_limit;
$$;

-- ─── 헬퍼 RPC: 반경 내 최저가 ───
create or replace function rpc_stations_by_radius(
  p_lat float8, p_lng float8, p_radius_m int,
  p_product text, p_limit int
)
returns table (
  id text, name text, brand_code text, is_self boolean,
  lat float8, lng float8, price int, trade_dt date, distance_m float8
) language sql stable as $$
  select s.id, s.name, s.brand_code, s.is_self,
         st_y(s.geom::geometry) as lat,
         st_x(s.geom::geometry) as lng,
         p.price, p.trade_dt,
         st_distance(s.geom, st_makepoint(p_lng, p_lat)::geography) as distance_m
  from stations s
  join prices_latest p on p.station_id = s.id
  where p.product = p_product
    and st_dwithin(s.geom, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
  order by p.price asc, distance_m asc
  limit p_limit;
$$;
