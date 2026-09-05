-- 1000냥 주유소 — 주차장 레이어 1단계: 데이터 적재
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 기획: docs/improvements/2026-08-28-parking/plan.md
-- 원천: 공공데이터포털 「전국주차장정보표준데이터」 tn_pubr_prkplce_info_api
--       2026-09-05 실측 — 전체 18,878건, 34개 필드, resultCode 00(기존 DATA_GO_KR_API_KEY 로 열림).
--
-- 범위 주의: 이번 단계는 **1~2단계(적재 + 지도 레이어 + 직선거리순 목록)** 까지다.
--   기획서의 차별점인 3단계(카카오모빌리티 다중 목적지 API 로 "도착 시간순" 정렬)는
--   일일 쿼터 확인 후로 미뤘다(운영자 결정, 2026-09-05). 그래서 이 스키마는 정렬 축을
--   거리/구획수로만 두고, 도착시간은 저장하지 않는다 — 카카오 약관이 길찾기 결과의 DB 저장을
--   금지하므로 3단계가 와도 **저장하지 않고 실시간 계산**해야 한다. 스키마를 미리 만들지 않는다.

create extension if not exists postgis;

create table if not exists parking_lots (
  -- 원천 관리번호(prkplceNo). 지자체별 채번이라 전국 유일성이 보장되지 않아,
  -- 렌터카(place_key)와 같은 규약으로 합성키를 쓴다 — sha256(관리번호|주차장명|주소) 앞 32자.
  place_key      text primary key,
  src_no         text,                        -- prkplceNo 원문 보존(원천 대조용)
  name           text not null,               -- prkplceNm
  lot_kind       text,                        -- prkplceSe  공영/민영
  lot_type       text,                        -- prkplceType 노상/노외/부설
  road_addr      text,                        -- rdnmadr (비는 경우가 흔하다)
  jibun_addr     text,                        -- lnmadr
  -- 주차구획수. 만차 여부는 전국 통합 원천이 없어(기획 §1) 모른다고 두고, 규모만 정직하게 보여준다.
  capacity       integer,                     -- prkcmprt
  fee_kind       text,                        -- parkingchrgeInfo  무료/유료/혼합
  -- 요금(원). 원천이 비워 두는 경우가 흔해 전부 nullable.
  basic_time     integer,                     -- basicTime(분)
  basic_charge   integer,                     -- basicCharge
  add_unit_time  integer,                     -- addUnitTime(분)
  add_unit_charge integer,                    -- addUnitCharge
  day_ticket     integer,                     -- dayCmmtkt
  month_ticket   integer,                     -- monthCmmtkt
  pay_methods    text,                        -- metpay(원문)
  -- 운영시간: 평일/토요일/공휴일이 각각 따로 온다(원천 필드명 오타 포함 — 매핑은 코드에서 흡수).
  oper_days      text,                        -- operDay
  wd_open text, wd_close text,                -- 평일
  sat_open text, sat_close text,              -- 토요일
  hd_open text, hd_close text,                -- 공휴일
  tel            text,                        -- phoneNumber
  disabled_zone  boolean,                     -- pwdbsPpkZoneYn
  note           text,                        -- spcmnt(특이사항)
  inst_name      text,                        -- institutionNm 관리기관
  lat            double precision not null,
  lng            double precision not null,
  geom           geography(Point, 4326) not null,
  sigungu_code   text,                        -- 지역 랜딩용(주소에서 계산 — 0048 과 동일 규약)
  data_base_date date,                        -- referenceDate
  synced_at      timestamptz not null default now()
);

create index if not exists parking_lots_geom_idx    on parking_lots using gist (geom);
create index if not exists parking_lots_synced_idx  on parking_lots (synced_at);
create index if not exists parking_lots_sigungu_idx on parking_lots (sigungu_code);

alter table parking_lots disable row level security;  -- 서버(service_role) 전용

-- ─── bbox(지도 영역) 조회 ───
-- 정렬: 구획수 큰 곳 우선. 만차를 모르는 상태에서 "클수록 자리가 있을 확률이 높다"는 건
-- 사용자가 스스로 판단할 수 있는 사실이고, 상한(p_limit)에 걸릴 때 잘라내는 기준으로도 타당하다.
create or replace function rpc_parking_by_bbox(
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int,
  p_free_only boolean default false
)
returns table (
  place_key text, name text, lot_kind text, lot_type text,
  road_addr text, jibun_addr text, tel text,
  capacity int, fee_kind text,
  basic_time int, basic_charge int, add_unit_time int, add_unit_charge int,
  day_ticket int, month_ticket int, pay_methods text,
  oper_days text, wd_open text, wd_close text, sat_open text, sat_close text,
  hd_open text, hd_close text,
  disabled_zone boolean, note text, inst_name text,
  lat float8, lng float8,
  data_base_date date, synced_at timestamptz
) language sql stable as $$
  select
    p.place_key, p.name, p.lot_kind, p.lot_type,
    p.road_addr, p.jibun_addr, p.tel,
    p.capacity, p.fee_kind,
    p.basic_time, p.basic_charge, p.add_unit_time, p.add_unit_charge,
    p.day_ticket, p.month_ticket, p.pay_methods,
    p.oper_days, p.wd_open, p.wd_close, p.sat_open, p.sat_close,
    p.hd_open, p.hd_close,
    p.disabled_zone, p.note, p.inst_name,
    p.lat, p.lng,
    p.data_base_date, p.synced_at
  from parking_lots p
  where p.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
    and (not p_free_only or p.fee_kind = '무료')
  order by coalesce(p.capacity, 0) desc, p.place_key
  limit p_limit;
$$;

-- ─── 반경 조회(내 주변 탭) ───
-- 2단계는 **직선거리순**이다. 3단계에서 도착 시간순으로 바꾸더라도 이 RPC 는 후보 추림에 그대로 쓴다
-- (다중 목적지 API 가 한 번에 30곳까지라, 반경으로 추린 상위 N 을 넘기는 구조가 된다).
create or replace function rpc_parking_by_radius(
  p_lat float8, p_lng float8, p_radius_m int, p_limit int,
  p_free_only boolean default false
)
returns table (
  place_key text, name text, lot_kind text, lot_type text,
  road_addr text, jibun_addr text, tel text,
  capacity int, fee_kind text,
  basic_time int, basic_charge int, add_unit_time int, add_unit_charge int,
  day_ticket int, month_ticket int, pay_methods text,
  oper_days text, wd_open text, wd_close text, sat_open text, sat_close text,
  hd_open text, hd_close text,
  disabled_zone boolean, note text, inst_name text,
  lat float8, lng float8, distance_m float8,
  data_base_date date, synced_at timestamptz
) language sql stable as $$
  select
    p.place_key, p.name, p.lot_kind, p.lot_type,
    p.road_addr, p.jibun_addr, p.tel,
    p.capacity, p.fee_kind,
    p.basic_time, p.basic_charge, p.add_unit_time, p.add_unit_charge,
    p.day_ticket, p.month_ticket, p.pay_methods,
    p.oper_days, p.wd_open, p.wd_close, p.sat_open, p.sat_close,
    p.hd_open, p.hd_close,
    p.disabled_zone, p.note, p.inst_name,
    p.lat, p.lng,
    st_distance(p.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m,
    p.data_base_date, p.synced_at
  from parking_lots p
  where st_dwithin(p.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and (not p_free_only or p.fee_kind = '무료')
  order by distance_m
  limit p_limit;
$$;
