-- 1000냥 주유소 - 전기차 충전소(MVP)
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 데이터 출처: 공공데이터포털(data.go.kr) 한국환경공단 EvCharger /getChargerInfo.
-- 충전기 단위 행(충전소 1곳=statId, 충전기 N대=chger_id). 정적정보 + 상태를 1일 1회 sync로 적재한다.
-- 지도/상세는 우리 DB(이 테이블)만 조회하고, data.go.kr API는 sync에서만 호출한다.
--
-- 상태(stat)는 준실시간이 아니라 "마지막 sync 시점 스냅샷"이며, stat_upd_dt(원천 갱신시각)를
-- 함께 저장해 상세/팝업에서 "최근 갱신 X 전"을 표시한다.

create extension if not exists postgis;

create table if not exists ev_chargers (
  stat_id       text not null,                 -- 충전소 ID(8)
  chger_id      text not null,                 -- 충전기 ID(2)
  stat_nm       text not null,                 -- 충전소명
  addr          text,
  addr_detail   text,
  lat           double precision not null,
  lng           double precision not null,
  geom          geography(Point, 4326) not null,
  chger_type    text,                          -- 충전기 타입 코드(01~10 등)
  output_kw     integer,                       -- 충전용량(kW)
  use_time      text,                          -- 이용시간
  method        text,                          -- 단독/동시
  busi_id       text,
  busi_nm       text,                          -- 운영기관
  busi_call     text,
  stat          text,                          -- 상태 코드(0~5)
  stat_upd_dt   timestamptz,                   -- 원천 상태 갱신 시각(statUpdDt)
  kind          text,
  kind_detail   text,
  zcode         text,                          -- 시도 코드(2)
  zscode        text,                          -- 시군구 코드
  parking_free  boolean,                       -- 주차 무료(Y/N)
  limit_yn      boolean,                       -- 이용 제한(Y/N)
  del_yn        boolean default false,         -- 삭제(Y/N) — 소프트 삭제
  output_raw    text,                          -- 원문 보존(파싱 실패 대비)
  synced_at     timestamptz default now(),     -- 우리 DB sync 시각
  primary key (stat_id, chger_id)
);

-- bbox(지도 영역) 조회용 공간 인덱스 (주유소 stations_geom_idx와 동일 방식)
create index if not exists ev_chargers_geom_idx on ev_chargers using gist (geom);
-- 충전소 단위 그룹/집계용
create index if not exists ev_chargers_stat_idx  on ev_chargers (stat_id);
-- 시도별 sync stale 정리용
create index if not exists ev_chargers_zcode_idx on ev_chargers (zcode);

-- ─── bbox 내 충전소(statId 단위 그룹 + 충전기 상태 집계) ───
-- 삭제(del_yn) 행은 제외. 마커 1개 = 충전소 1곳.
-- available = stat='2'(사용가능) 대수, total = 충전기 총 대수.
-- has_fast/has_slow = 충전기 타입/용량 기반 급속·완속 보유 여부.
-- latest_stat_upd_dt = 충전소 내 최신 상태 갱신 시각("최근 갱신 X 전" 표시용).
create or replace function rpc_ev_chargers_by_bbox(
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int
)
returns table (
  stat_id text, name text, lat float8, lng float8,
  busi_nm text,
  total_chargers int, available_chargers int,
  has_fast boolean, has_slow boolean,
  max_output int, latest_stat_upd_dt timestamptz, synced_at timestamptz
) language sql stable as $$
  with hit as (
    select *
    from ev_chargers c
    where coalesce(c.del_yn, false) = false
      and c.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  )
  select
    h.stat_id,
    max(h.stat_nm) as name,
    avg(h.lat) as lat,
    avg(h.lng) as lng,
    max(h.busi_nm) as busi_nm,
    count(*)::int as total_chargers,
    count(*) filter (where h.stat = '2')::int as available_chargers,
    bool_or(
      coalesce(h.output_kw, 0) >= 50
      or h.chger_type not in ('02','07','08')
    ) as has_fast,
    bool_or(
      (h.output_kw is not null and h.output_kw < 50)
      or h.chger_type in ('02','07','08')
    ) as has_slow,
    max(h.output_kw)::int as max_output,
    max(h.stat_upd_dt) as latest_stat_upd_dt,
    max(h.synced_at) as synced_at
  from hit h
  group by h.stat_id
  order by available_chargers desc, total_chargers desc
  limit p_limit;
$$;
