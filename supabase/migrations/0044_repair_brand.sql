-- 1000냥 주유소 - 정비소 브랜드(체인·공식 서비스망) 필터
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 원천(전국자동차정비업체표준데이터)에는 브랜드 필드가 없다. 업체명에서 추론해
-- (lib/repair/brand.ts) sync 때 이 컬럼을 채운다. null = 무소속 동네 카센터로, 실측상 전체의
-- 약 94%(32,056/34,172)가 여기 해당한다 — null 이 예외가 아니라 다수다.
--
-- ⚠️ 적용 순서: 이 마이그레이션을 먼저 적용해도 안전하다(기존 행은 brand=null 로 남고,
--    bbox 조회는 그대로 동작한다). 값이 채워지려면 sync-repair 를 한 번 더 돌려야 한다.

alter table repair_shops add column if not exists brand text;

-- 브랜드 필터는 "특정 브랜드만" 또는 "무소속만" 두 방향 모두 쓰이므로 null 도 인덱스에 태운다.
create index if not exists repair_shops_brand_idx on repair_shops (brand);

-- bbox RPC 를 brand 포함으로 교체한다.
-- (create or replace 는 반환 타입이 바뀌면 실패하므로 먼저 drop 한다 — 0040 의 교훈과 같은 함정이다.)
drop function if exists rpc_repair_by_bbox(float8, float8, float8, float8, int);

create function rpc_repair_by_bbox(
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int
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
  limit p_limit;
$$;
