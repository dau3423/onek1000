-- 1000냥 주유소 - 정비소 bbox 조회에 브랜드 필터를 서버로 내린다
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 왜 필요한가(실제 버그): bbox 는 화면당 150건 상한이 있는데 정렬이 없어 **임의의 150건**이 온다.
-- 브랜드 지점은 전체의 6%(블루핸즈는 전국 74곳)라, 강남처럼 정비소가 1,000곳 넘는 지역에서
-- 150건을 뽑으면 블루핸즈는 0~1건만 섞인다. 그 상태에서 클라이언트가 브랜드로 거르면
-- "블루핸즈 필터를 켰는데 아무것도 안 보이는" 화면이 된다(실측: limit 150 → 블루핸즈 1건).
--
-- 해법은 자르기 **전에** 거르는 것 — 즉 필터를 SQL 로 내린다.
--
-- p_brand 규칙:
--   null      → 전체(기존 동작)
--   'none'    → 브랜드 없는 무소속만
--   그 외 값   → 해당 브랜드만
--
-- ⚠️ 기본값을 둔 6번째 인자를 추가하는 형태라, 이 함수를 5개 인자로 부르던 기존 코드도
--    그대로 동작한다(배포 순서에 무관하게 안전하다).

drop function if exists rpc_repair_by_bbox(float8, float8, float8, float8, int);
drop function if exists rpc_repair_by_bbox(float8, float8, float8, float8, int, text);

create function rpc_repair_by_bbox(
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int,
  p_brand  text default null
)
returns table (
  shop_key text, name text, shop_type text, brand text,
  road_addr text, jibun_addr text, tel text,
  open_time text, close_time text,
  lat float8, lng float8,
  data_base_date date, synced_at timestamptz
) language sql stable as $$
  select
    r.shop_key, r.name, r.shop_type, r.brand,
    r.road_addr, r.jibun_addr, r.tel,
    r.open_time, r.close_time,
    r.lat, r.lng,
    r.data_base_date, r.synced_at
  from repair_shops r
  where r.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
    and (
      p_brand is null
      or (p_brand = 'none' and r.brand is null)
      or r.brand = p_brand
    )
  limit p_limit;
$$;
