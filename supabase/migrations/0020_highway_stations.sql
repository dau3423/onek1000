-- 0020: 한국도로공사 고속도로(휴게소) 주유소 적재 지원
-- Supabase SQL Editor 또는 supabase db push 로 적용.
--
-- 배경: Opinet 가격 sync(lowTop10.do)는 "시군구별 최저가 TOP10"만 수집하므로
-- 고속도로 휴게소 주유소가 대부분 누락된다. 한국도로공사 공공데이터 API
-- (curStateStation)로 고속도로 주유소를 별도 적재한다.
--
-- 적재 방식:
--  - id 는 'EX:' + serviceAreaCode2 prefix 로 적재해 Opinet UNI_ID 와 충돌하지 않게 한다.
--  - brand_code = 'EXP'(고속도로) 로 고정 적재한다(types/station.ts BrandCode 'EXP' 와 일치).
--  - is_highway 플래그로 소스를 구분하고, UI에서 '고속도로' 배지/필터에 사용한다.
--  - 좌표는 sync 단계에서 svarAddr(주소)를 카카오 로컬 지오코딩으로 1회 변환해 저장한다
--    (상세/조회 시 실시간 호출 금지). 좌표를 못 구한 휴게소는 적재 보류한다(지도 표시 불가).
--
-- 가격(prices_latest)은 기존 테이블/PK(station_id, product)를 그대로 사용한다.
-- station_id FK 는 stations(id) 를 참조하므로, 같은 sync 트랜잭션에서 stations 를 먼저
-- upsert 한 뒤 prices_latest 를 upsert 하면 EX 가격도 정상 적재된다.

-- stations 에 고속도로 메타 컬럼 추가(없으면).
alter table stations
  add column if not exists is_highway  boolean default false,  -- 고속도로(휴게소) 주유소 여부
  add column if not exists route_name  text,                   -- 노선명(예: 경부선)
  add column if not exists direction   text;                   -- 방향(예: 부산)

-- 고속도로 주유소만 빠르게 필터/정리하기 위한 부분 인덱스.
create index if not exists stations_highway_idx
  on stations (is_highway) where is_highway = true;
