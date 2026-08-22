-- 1000냥 주유소 - 정비소 bbox 정렬의 면적 캐스팅 오류 수정
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 버그: 0046 의 정렬에서 면적을 `regexp_replace(area, '[^0-9.]', '', 'g')::numeric` 으로 캐스팅했다.
-- 숫자와 점만 남기면 안전할 거라 봤지만, 점이 두 개 이상인 값은 여전히 numeric 이 아니다.
-- 실데이터에 정확히 3건 있었다 — '169.05.' / '101.25.' / '231.4.4'.
-- 이 3건이 bbox 범위에 들어오는 순간 쿼리 전체가 22P02 로 실패한다(400).
-- 강남 같은 좁은 범위에서는 안 걸려서, 지도를 축소해 전국이 보일 때만 터졌다 —
-- 정확히 이번에 만든 '축소 시 표시' 기능이 죽는 조합이었다.
--
-- 0046 파일을 고치지 않고 새 번호로 낸다(이미 적용된 마이그레이션은 수정하지 않는다는 규칙).
--
-- 수정 원칙: **캐스팅이 실패할 수 있는 경로를 아예 없앤다.**
--   1) 숫자·점만 남기고(단위 표기 대비)
--   2) 그 결과가 '숫자[.숫자]' **전체 일치**일 때만 numeric 으로 캐스팅
--   3) 아니면 0
-- 정규식 매칭(~)이 먼저 통과한 값만 캐스팅하므로 22P02 가 원천적으로 불가능하다.
-- substring + 캡처그룹 방식은 쓰지 않는다 — 괄호가 캡처로 해석되는지에 동작이 달라져
-- '검증하지 않은 가정'이 하나 더 생긴다. 여기서는 그런 여지를 두지 않는다.

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
    case
      when regexp_replace(coalesce(r.area, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
      then regexp_replace(coalesce(r.area, ''), '[^0-9.]', '', 'g')::numeric
      else 0
    end desc,
    r.shop_key
  limit p_limit;
$$;
