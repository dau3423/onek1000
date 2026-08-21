-- 1000냥 주유소 - 자동차 정비소 레이어
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 원천: 공공데이터포털 「전국자동차정비업체표준데이터」(국토교통부/지자체)
--   오픈API: https://api.data.go.kr/openapi/tn_pubr_public_auto_maintenance_company_api
--   좌표(WGS84) 채움률 100%, 이용허락범위 제한 없음, 무료·자동승인. 갱신주기 반기.
--
-- carwash_places(0038) 와 같은 구조를 따른다 — bbox 공간조회 + 지도 레이어.
--
-- ⚠️ PK 주의: 이 표준데이터에는 세차장의 mgmt_no 같은 고유 관리번호가 없다.
--   그래서 (기관코드 + 업체명 + 주소) 로 만든 결정적 해시를 shop_key 로 쓴다(sync 코드에서 생성).
--   같은 입력이면 항상 같은 키가 나오므로 재실행이 멱등이다. 다만 업체명이나 주소가 원천에서
--   바뀌면 새 키가 되어 옛 행이 남는다 — sync 가 "완주했을 때만" 오래된 행을 정리한다
--   (부분 실패 시 정리하지 않는다. 전체삭제 후 재삽입은 절대 하지 않는다 — sync-carwash 와 동일 원칙).

create extension if not exists postgis;

create table if not exists repair_shops (
  shop_key       text primary key,            -- 결정적 합성키(sha256(기관코드|업체명|주소) 앞 32자)
  name           text not null,               -- 자동차정비업체명
  shop_type      text not null default 'unknown', -- 정규화 유형: general|small|specialty|engine|unknown
  road_addr      text,                        -- 소재지도로명주소
  jibun_addr     text,                        -- 소재지지번주소
  tel            text,                        -- 전화번호(채움률 약 51% — 없을 수 있다)
  open_time      text,                        -- 운영시작시각(채움률 약 38%)
  close_time     text,                        -- 운영종료시각
  biz_status     text,                        -- 영업상태 원문(정규화 전 값 보존)
  area           text,                        -- 면적
  lat            double precision not null,   -- WGS84 위도
  lng            double precision not null,   -- WGS84 경도
  geom           geography(Point, 4326) not null, -- bbox 공간 조회용
  institution    text,                        -- 관리기관명
  data_base_date date,                        -- 데이터기준일자(노후 행 판정용)
  synced_at      timestamptz not null default now()
);

create index if not exists repair_shops_geom_idx on repair_shops using gist (geom);
create index if not exists repair_shops_type_idx on repair_shops (shop_type);
-- 완주 후 오래된 행 정리에 쓴다(synced_at < 이번 실행 시작 시각).
create index if not exists repair_shops_synced_idx on repair_shops (synced_at);

-- 폐업/휴업 행은 애초에 적재하지 않으므로(sync 에서 거른다) 여기서 상태 필터는 하지 않는다.
create or replace function rpc_repair_by_bbox(
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int
)
returns table (
  shop_key text, name text, shop_type text,
  road_addr text, jibun_addr text, tel text,
  open_time text, close_time text,
  lat float8, lng float8,
  data_base_date date, synced_at timestamptz
) language sql stable as $$
  select
    r.shop_key, r.name, r.shop_type,
    r.road_addr, r.jibun_addr, r.tel,
    r.open_time, r.close_time,
    r.lat, r.lng,
    r.data_base_date, r.synced_at
  from repair_shops r
  where r.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  limit p_limit;
$$;

alter table repair_shops disable row level security;  -- 서버(service_role) 전용
