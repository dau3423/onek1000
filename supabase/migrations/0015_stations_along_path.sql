-- 경로별 최저가(도로 경로 기반) — 직선 대신 카카오내비 도로 경로(LineString) buffer 내 최저가.
-- 기존 rpc_stations_along_route 는 출발↔도착 직선(2점) 기준이라 실제 도로를 벗어난 주유소가
-- 잡히거나 도로변 주유소를 놓칠 수 있다. 이 함수는 도로 경로 점 배열을 받아 LineString 으로
-- 만들고 그 주변 buffer 내 주유소를 반환한다. directions 실패 시 호출부에서 기존 직선 RPC로 폴백.
--
-- p_path_lng / p_path_lat: 도로 경로 점들의 경도/위도 배열(같은 길이, 주행 순서).
--   (PostgREST 가 float8[] 를 그대로 받기 쉽도록 평행 배열로 전달한다.)
create or replace function rpc_stations_along_path(
  p_path_lng float8[],
  p_path_lat float8[],
  p_buffer_m int,
  p_product  text,
  p_limit    int
)
returns table (
  id text, name text, brand_code text, is_self boolean,
  lat float8, lng float8, price int, trade_dt date,
  distance_m float8
) language sql stable as $$
  with pts as (
    select i as idx, p_path_lng[i] as lng, p_path_lat[i] as lat
    from generate_subscripts(p_path_lng, 1) as i
    where p_path_lng[i] is not null and p_path_lat[i] is not null
  ),
  line as (
    -- 배열 인덱스 순서(=주행 순서)를 그대로 유지해 LineString 생성.
    -- 점이 2개 미만이면 makeline 이 NULL → 호출부에서 결과 0건 처리/폴백.
    select st_makeline(st_makepoint(lng, lat) order by idx) ::geography as g
    from pts
  )
  select s.id, s.name, s.brand_code, s.is_self,
         coalesce(s.lat, st_y(s.geom::geometry)) as lat,
         coalesce(s.lng, st_x(s.geom::geometry)) as lng,
         p.price, p.trade_dt,
         st_distance(s.geom, line.g) as distance_m
  from stations s
  join prices_latest p on p.station_id = s.id
  cross join line
  where line.g is not null
    and p.product = p_product
    and st_dwithin(s.geom, line.g, p_buffer_m)
  order by p.price asc, distance_m asc
  limit p_limit;
$$;
