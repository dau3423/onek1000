-- 1000냥 주유소 - 정비소 bbox 조회에 "중요도 순" 정렬을 넣는다
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 왜 필요한가: bbox 는 상한(150)만 있고 정렬이 없어 **임의의** 150건이 온다. 그래서 지도를
-- 축소해 전국이 보이면 전국 3.4만 곳 중 아무 곳이나 흩뿌려지고, 이름을 아는 곳은 거의 없다.
--
-- 무엇이 '상위'인가: 정비소는 주유소와 달리 가격 같은 순위 근거가 없다. 대신 **알아볼 수 있는가**
-- 를 기준으로 삼는다 — 축소 화면에서는 블루핸즈·오토큐·티스테이션처럼 이름이 읽히는 곳이
-- 모르는 상호보다 쓸모 있다. 그래서 브랜드 지점을 맨 앞에 둔다.
--
-- 정렬:
--   1) 브랜드 있는 곳 먼저
--   2) 그다음 정비 등급(종합1급 → 소형2급 → 전문3급 → 원동기 → 미상)
--   3) 같으면 면적 큰 곳(규모가 큰 공장이 먼저)
--   4) 마지막으로 shop_key — 동률에서 결과가 매번 흔들리지 않게 고정한다
--      (이게 없으면 같은 화면을 다시 열 때 마커가 바뀌어 보인다)
--
-- 호출부는 줌 레벨에 따라 p_limit 을 달리 준다(전국 40 / 시도 80 / 시군구 150).
-- 상한이 작을수록 위 순서의 앞쪽만 남으므로, 축소할수록 브랜드 지점만 보이게 된다.

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
  order by
    (r.brand is null),                       -- false(=브랜드 있음)가 먼저
    case r.shop_type
      when 'general'   then 1
      when 'small'     then 2
      when 'specialty' then 3
      when 'engine'    then 4
      else 5
    end,
    -- 면적은 원천이 문자열이라 숫자로 못 바꾸는 값이 섞여 있다. 실패하면 0 으로 본다.
    coalesce(nullif(regexp_replace(coalesce(r.area, ''), '[^0-9.]', '', 'g'), '')::numeric, 0) desc,
    r.shop_key
  limit p_limit;
$$;
