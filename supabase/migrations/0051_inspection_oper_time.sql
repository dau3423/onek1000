-- 1000냥 주유소 - 검사소 운영시간을 원문 한 칸으로 정리
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 왜 별도 번호로 내는가: 0050 은 이미 적용됐다. 이미 적용된 마이그레이션은 고치지 않는다는
-- 규칙에 따라 새 번호로 낸다(0050 파일 자체도 최신 형태로 고쳐져 있지만, 먼저 적용한 환경에는
-- 옛 컬럼이 남아 있다 — 이 파일이 그 차이를 메운다. 0050 을 아직 적용하지 않은 환경에서는
-- 이 파일이 전부 no-op 이므로 어느 순서로 적용해도 같은 결과가 된다).
--
-- 배경(실측 821건 전수):
--   운영시간 원문이 '평일 09:00~18:00+토요일 09:00~13:00' 처럼 구간을 둘 이상 담는 경우가
--   330건(40%)이다. 시작/종료 두 칸으로 쪼개면 토요일 정보가 통째로 사라진다.
--   채움률 100% 인 필드라 손실이 크고, '평일(09:00~18:00)' 같은 변형도 있어 안전한 파싱 규칙이
--   존재하지 않는다. → 파싱을 버리고 원문을 그대로 보존한다.

alter table inspection_stations add column if not exists oper_time text;

-- 옛 컬럼 제거. 데이터 이전은 하지 않는다 — 0050 적용 직후라 이 테이블은 비어 있고,
-- 값이 있더라도 쪼개진 값이라 원문으로 되돌릴 수 없다(sync 가 원천에서 다시 채운다).
alter table inspection_stations drop column if exists open_time;
alter table inspection_stations drop column if exists close_time;

-- 정비소 bbox RPC 재정의 — union 의 검사소 쪽이 없어진 컬럼을 참조하지 않도록.
-- 0050 의 정의와 동일하되, 검사소 운영시간은 마커에 필요 없으므로 null 로 내보낸다
-- (상세 화면이 oper_time 원문을 직접 읽어 그대로 보여준다).
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
  with env as (
    select st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326) as g
  ),
  merged as (
    -- 정비업체
    select
      r.shop_key, r.name, r.shop_type,
      case
        when o.brand is null  then r.brand
        when o.brand = 'none' then null
        else o.brand
      end as eff_brand,
      r.road_addr, r.jibun_addr, r.tel, r.open_time, r.close_time,
      r.lat, r.lng, r.data_base_date, r.synced_at,
      -- 면적 문자열에서 숫자만 안전하게 뽑는다. 전체 일치일 때만 캐스팅한다 —
      -- '231.4.4' 같은 값이 실제로 있어 22P02 로 쿼리가 통째로 죽은 적이 있다(0047).
      case
        when regexp_replace(coalesce(r.area, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
        then regexp_replace(coalesce(r.area, ''), '[^0-9.]', '', 'g')::numeric
        else 0
      end as size_rank,
      0 as src_order
    from repair_shops r
    cross join env
    left join repair_brand_override o on o.shop_key = r.shop_key
    where r.geom && env.g

    union all

    -- 자동차검사소(별도 표준데이터). 브랜드/유형을 inspection 으로 고정한다.
    select
      i.place_key as shop_key, i.name, 'inspection' as shop_type,
      'inspection' as eff_brand,
      -- 검사소 운영시간은 한 덩어리 원문이라 open/close 두 칸에 담기지 않는다.
      i.road_addr, i.jibun_addr, i.tel, null::text as open_time, null::text as close_time,
      i.lat, i.lng, i.data_base_date, i.synced_at,
      coalesce(i.lane_count, 0)::numeric as size_rank,   -- 검사진로수가 규모 지표
      1 as src_order
    from inspection_stations i
    cross join env
    where i.geom && env.g
  )
  select
    m.shop_key, m.name, m.shop_type, m.eff_brand as brand,
    m.road_addr, m.jibun_addr, m.tel,
    m.open_time, m.close_time,
    m.lat, m.lng,
    m.data_base_date, m.synced_at
  from merged m
  where (
      p_brand is null
      or (p_brand = 'none' and m.eff_brand is null)
      or m.eff_brand = p_brand
    )
  order by
    (m.eff_brand is null),
    case m.shop_type
      when 'inspection' then 0
      when 'general'    then 1
      when 'small'      then 2
      when 'specialty'  then 3
      when 'engine'     then 4
      else 5
    end,
    m.size_rank desc,
    m.src_order,
    m.shop_key
  limit p_limit;
$$;
