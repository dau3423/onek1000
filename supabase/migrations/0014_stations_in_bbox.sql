-- 화면 영역(bbox) 내 "전체 주유소"(가격 유무 무관) — 회색 점(비하이라이트) 렌더용.
-- 기존 rpc_stations_by_bbox 는 prices_latest 와 inner join 이라 가격 있는 주유소만 반환한다.
-- 회색 점은 "하이라이트(전국 TOP/지역 최저가/내 주변)에 안 든 주유소"를 표시하기 위한 것이라
-- 가격이 없는 주유소도 포함해야 한다. 좌표/브랜드만 필요하므로 가격 join 없이 경량 반환한다.
-- 줌 게이팅으로 확대 시에만 호출되고, p_limit 으로 마커 상한을 둬 대량 로드를 막는다.
create or replace function rpc_stations_in_bbox(
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int
)
returns table (
  id text, name text, brand_code text, is_self boolean,
  lat float8, lng float8
) language sql stable as $$
  select s.id, s.name, s.brand_code, s.is_self,
         st_y(s.geom::geometry) as lat,
         st_x(s.geom::geometry) as lng
  from stations s
  where s.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  limit p_limit;
$$;
