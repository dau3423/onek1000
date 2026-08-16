-- 0036: 세차 필터 — bbox/radius/bbox_brand RPC에 세차(has_carwash) 조건·반환 추가
--
-- 배경(FR-1, 세차 묶음):
--   - 지도 "세차" 칩을 켜면 has_carwash=true 주유소만 조회해야 한다(서버측 필터).
--     bbox RPC는 "가격 낮은 순 TOP N"을 잘라 반환하므로 클라이언트 후필터로는
--     결과가 과소해진다(TOP N에 든 세차 주유소만 남음). RPC 조건이라야 limit이
--     세차 주유소로 채워져 "세차 되는 곳 중 최저가 TOP N"이 된다.
--   - 목록 세차 배지를 위해 반환 컬럼에 has_carwash 를 추가한다(칩 OFF에서도 배지 노출).
--
-- 시그니처 변경(파라미터/반환형 추가)은 create or replace 불가 → drop 후 재생성.
--   구 시그니처를 반드시 drop 해야 PostgREST 호출 모호성(ambiguity)이 생기지 않는다.
--   p_carwash 는 default false 라 신규 파라미터를 넘기지 않는 구 앱 호출과도 호환된다.
--   (Supabase 마이그레이션은 기본 트랜잭션이라 drop→create 사이 순단 최소화.)
--
-- 프로덕션 적용: **이 마이그레이션은 운영자가 수동 실행한다**(이번 배포 범위 아님).
--   미적용 창에서는 lib/db/queries.ts 가 p_carwash 부재 에러를 감지해 구 시그니처로
--   폴백하므로(세차 필터 미적용·배지 미표시) 앱이 깨지지 않는다.

-- ─── 1) bbox 최저가 TOP N (+ p_carwash / has_carwash) ───
drop function if exists rpc_stations_by_bbox(text, float8, float8, float8, float8, int);
create function rpc_stations_by_bbox(
  p_product text,
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int,
  p_carwash boolean default false
)
returns table (
  id text, name text, brand_code text, is_self boolean,
  lat float8, lng float8, price int, trade_dt date, has_carwash boolean
) language sql stable as $$
  select s.id, s.name, s.brand_code, s.is_self,
         st_y(s.geom::geometry) as lat,
         st_x(s.geom::geometry) as lng,
         p.price, p.trade_dt, s.has_carwash
  from stations s
  join prices_latest p on p.station_id = s.id
  where p.product = p_product
    and (not p_carwash or s.has_carwash)
    and s.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  order by p.price asc
  limit p_limit;
$$;

-- ─── 2) 반경 내 최저가 (+ p_carwash / has_carwash) ───
drop function if exists rpc_stations_by_radius(float8, float8, int, text, int);
create function rpc_stations_by_radius(
  p_lat float8, p_lng float8, p_radius_m int,
  p_product text, p_limit int,
  p_carwash boolean default false
)
returns table (
  id text, name text, brand_code text, is_self boolean,
  lat float8, lng float8, price int, trade_dt date, distance_m float8, has_carwash boolean
) language sql stable as $$
  select s.id, s.name, s.brand_code, s.is_self,
         st_y(s.geom::geometry) as lat,
         st_x(s.geom::geometry) as lng,
         p.price, p.trade_dt,
         st_distance(s.geom, st_makepoint(p_lng, p_lat)::geography) as distance_m,
         s.has_carwash
  from stations s
  join prices_latest p on p.station_id = s.id
  where p.product = p_product
    and (not p_carwash or s.has_carwash)
    and st_dwithin(s.geom, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
  order by p.price asc, distance_m asc
  limit p_limit;
$$;

-- ─── 3) bbox 단일 브랜드 조회 (+ p_carwash / has_carwash) ───
drop function if exists rpc_stations_by_bbox_brand(text, text, float8, float8, float8, float8, int);
create function rpc_stations_by_bbox_brand(
  p_product text,
  p_brand   text,
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int,
  p_carwash boolean default false
)
returns table (
  id text, name text, brand_code text, is_self boolean,
  lat float8, lng float8, price int, trade_dt date, has_carwash boolean
) language sql stable as $$
  select s.id, s.name, s.brand_code, s.is_self,
         st_y(s.geom::geometry) as lat,
         st_x(s.geom::geometry) as lng,
         p.price, p.trade_dt, s.has_carwash
  from stations s
  join prices_latest p on p.station_id = s.id
  where p.product = p_product
    and s.brand_code = p_brand
    and (not p_carwash or s.has_carwash)
    and s.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  order by p.price asc
  limit p_limit;
$$;
