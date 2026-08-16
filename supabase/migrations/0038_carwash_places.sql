-- 1000냥 주유소 - 독립 셀프·손세차장 지도 레이어 (FR-1)
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 데이터 출처: 행정안전부 「전국세차장표준데이터」(data.go.kr 15013193, 이용허락 제한 없음·무료·무인증).
-- 세차장 1곳 = 1행(mgmt_no). 정적정보를 주 1회 sync-carwash 크론으로 적재한다.
-- 지도/조회는 우리 DB(이 테이블)만 보고, 원천 파일서버(file.localdata.go.kr)는 sync에서만 호출한다.
--
-- 개인정보 최소화: 원천의 '대표자명' 컬럼은 스키마에 두지 않는다(임포트/저장/조회 어디에도 없음).
-- 부설(주유·충전 업종) 행은 기존 stations.has_carwash와 중복 → sync 단계에서 제외(독립 세차장만 적재).

create extension if not exists postgis;

create table if not exists carwash_places (
  mgmt_no        text primary key,            -- 관리번호(원천 PK)
  name           text not null,               -- 사업장명
  -- 세차유형(정규화): self=셀프 / hand=손세차·디테일 / auto=자동·기계식 / unknown=미확인.
  -- 원천 '세차유형' 자유입력 필드 + 사업장명 키워드를 결합해 sync에서 정규화한다.
  wash_type      text not null default 'unknown',
  road_addr      text,                        -- 소재지 도로명주소
  jibun_addr     text,                        -- 소재지 지번주소
  tel            text,                        -- 세차장 전화번호(있을 때만)
  weekday_open   text,                        -- 평일 운영 시작 시각(있을 때만)
  weekday_close  text,                        -- 평일 운영 종료 시각
  holiday_open   text,                        -- 휴일 운영 시작 시각
  holiday_close  text,                        -- 휴일 운영 종료 시각
  fee_info       text,                        -- 세차요금정보(있을 때만, 채움률 낮음)
  closed_day     text,                        -- 휴무일(있을 때만)
  lat            double precision not null,   -- WGS84 위도
  lng            double precision not null,   -- WGS84 경도
  geom           geography(Point, 4326) not null, -- bbox 공간 조회용
  biz_type_raw   text,                        -- 사업장업종명 원문(부설/독립 판정 근거 보존)
  data_base_date date,                        -- 데이터기준일자(노후 행 판정용)
  synced_at      timestamptz default now()    -- 우리 DB sync 시각
);

-- bbox(지도 영역) 조회용 공간 인덱스 (주유소/EV와 동일 방식)
create index if not exists carwash_places_geom_idx on carwash_places using gist (geom);
-- 유형 필터/집계용
create index if not exists carwash_places_wash_type_idx on carwash_places (wash_type);

-- ─── bbox 내 세차장 (마커 1개 = 세차장 1곳) ───
-- geom && st_makeenvelope bbox 조건 + limit. 마커/팝업 표시용 필드만 반환.
-- 개인정보(대표자명)는 스키마에 없으므로 반환에도 존재하지 않는다.
create or replace function rpc_carwash_by_bbox(
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int
)
returns table (
  mgmt_no text, name text, wash_type text,
  road_addr text, jibun_addr text, tel text,
  weekday_open text, weekday_close text,
  fee_info text, closed_day text,
  lat float8, lng float8,
  data_base_date date, synced_at timestamptz
) language sql stable as $$
  select
    c.mgmt_no, c.name, c.wash_type,
    c.road_addr, c.jibun_addr, c.tel,
    c.weekday_open, c.weekday_close,
    c.fee_info, c.closed_day,
    c.lat, c.lng,
    c.data_base_date, c.synced_at
  from carwash_places c
  where c.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  limit p_limit;
$$;
