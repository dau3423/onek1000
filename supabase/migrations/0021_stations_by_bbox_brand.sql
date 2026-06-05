-- 0021: bbox 조회를 "특정 브랜드"로 한정하는 RPC 추가
--
-- 배경: 기존 rpc_stations_by_bbox 는 (유종 가격) 오름차순 상위 N(limit)만 반환한다.
-- 줌 아웃으로 bbox 가 넓어지면 일반 주유소(저렴한 곳)가 limit 을 채워, 전국 ~214개로
-- 희소하고 가격이 평범한 고속도로(brand_code='EXP', is_highway) 주유소가 상한에 밀려
-- 표시되지 않는다("고속도로만" 필터를 켜고 줌 아웃하면 핀이 사라지는 증상).
--
-- 해결: 브랜드를 인자로 받아 해당 브랜드만 조회하는 RPC 를 둔다. "고속도로만" 필터처럼
-- 단일 브랜드만 보고 싶을 때 이 RPC 로 그 브랜드만 limit 안에 담아 줌 아웃에서도
-- 누락 없이 표시한다. 기존 RPC/일반 조회 동작은 그대로 유지(이 RPC 는 추가만).
--
-- 정렬/반환 형태는 rpc_stations_by_bbox 와 동일하게 맞춰, 호출부(queries.ts)가 같은
-- 매핑 로직을 재사용할 수 있게 한다.
create or replace function rpc_stations_by_bbox_brand(
  p_product text,
  p_brand   text,
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
    and s.brand_code = p_brand
    and s.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  order by p.price asc
  limit p_limit;
$$;
