-- 1000냥 주유소 - 렌터카 레이어 + 자동차검사소 정확화
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- ── 왜 두 개를 한 파일에 담는가 ──────────────────────────────────────────────
-- 검사소는 새 레이어가 아니라 **정비소 레이어 안의 브랜드**로 들어간다. 그래서 정비소 bbox RPC 를
-- 함께 고쳐야 하고, 이 RPC 변경은 검사소 테이블이 존재해야 성립한다. 두 파일로 쪼개면 중간 상태에서
-- RPC 가 없는 테이블을 참조하게 된다.
--
-- ══ 1) 렌터카 ══════════════════════════════════════════════════════════════
-- 원천: 공공데이터포털 「전국렌터카업체정보표준데이터」
--   오픈API: https://api.data.go.kr/openapi/tn_pubr_public_car_rental_api
--   좌표(WGS84) 포함, 무료·자동승인, 갱신주기 반기, 169개 지자체 제공.
--
-- ⚠️ PK: 정비소와 같은 문제 — 고유 관리번호가 없다. (업체명 + 주소) 결정적 해시를 쓴다.
--   같은 입력이면 같은 키라 재실행이 멱등이다. 원천에서 이름/주소가 바뀌면 새 키가 되어 옛 행이
--   남으므로, sync 가 **완주했을 때만** 오래된 행을 정리한다(부분 실패 시 정리 금지 — 0042 와 동일 원칙).
--
-- ⚠️ 대표자명은 적재하지 않는다. 원천에 있지만 개인정보이고 지도 표시에 쓸 데가 없다.
--
-- 요금은 원천이 반기 갱신이라 실제와 어긋날 수 있다 → data_base_date 를 함께 저장하고 화면에
-- '기준일'로 반드시 표기한다(오피넷 유가의 tradeDate 와 같은 규약).

create extension if not exists postgis;

create table if not exists rental_cars (
  place_key      text primary key,            -- 결정적 합성키(sha256(업체명|주소) 앞 32자)
  name           text not null,               -- 업체명
  biz_kind       text,                        -- 사업장구분(원문 보존)
  road_addr      text,
  jibun_addr     text,
  tel            text,
  homepage       text,
  -- 운영시간: 평일/주말/공휴일이 각각 따로 온다.
  wd_open        text, wd_close   text,       -- 평일
  we_open        text, we_close   text,       -- 주말
  hd_open        text, hd_close   text,       -- 공휴일
  holiday        text,                        -- 휴무일(원문)
  -- 보유 대수. 전기차 보유 여부로 필터를 걸 수 있어 따로 둔다.
  total_cars     integer,
  sedan_cars     integer,
  van_cars       integer,
  ev_sedan_cars  integer,
  ev_van_cars    integer,
  -- 차종별 요금(원). 원천이 비워 두는 경우가 흔해 전부 nullable.
  fee_light      integer,   -- 경차
  fee_small      integer,   -- 소형
  fee_medium     integer,   -- 중형
  fee_large      integer,   -- 대형
  fee_van        integer,   -- 승합
  fee_leisure    integer,   -- 레저용(RV)
  fee_imported   integer,   -- 수입차
  lat            double precision not null,
  lng            double precision not null,
  geom           geography(Point, 4326) not null,
  sigungu_code   text,                        -- 지역 랜딩용(주소에서 계산 — 0048 과 동일 규약)
  data_base_date date,                        -- 데이터기준일자 → 화면의 '요금 기준일'
  synced_at      timestamptz not null default now()
);

create index if not exists rental_cars_geom_idx    on rental_cars using gist (geom);
create index if not exists rental_cars_synced_idx  on rental_cars (synced_at);
create index if not exists rental_cars_sigungu_idx on rental_cars (sigungu_code);
-- 전기차 보유 업체만 빠르게 거르기 위한 부분 인덱스.
create index if not exists rental_cars_ev_idx on rental_cars (place_key)
  where coalesce(ev_sedan_cars, 0) + coalesce(ev_van_cars, 0) > 0;

alter table rental_cars disable row level security;  -- 서버(service_role) 전용

-- bbox 조회. 정렬 기준은 "보여줄 값이 많은 순":
--   전기차 보유 → 총 보유대수 → 키(안정 정렬).
-- 줌아웃으로 limit 에 걸릴 때 규모 있는 업체가 먼저 남는다(정비소의 면적 정렬과 같은 취지).
create or replace function rpc_rental_by_bbox(
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int,
  p_ev_only boolean default false
)
returns table (
  place_key text, name text, biz_kind text,
  road_addr text, jibun_addr text, tel text, homepage text,
  wd_open text, wd_close text, we_open text, we_close text,
  hd_open text, hd_close text, holiday text,
  total_cars int, sedan_cars int, van_cars int, ev_sedan_cars int, ev_van_cars int,
  fee_light int, fee_small int, fee_medium int, fee_large int,
  fee_van int, fee_leisure int, fee_imported int,
  lat float8, lng float8,
  data_base_date date, synced_at timestamptz
) language sql stable as $$
  select
    r.place_key, r.name, r.biz_kind,
    r.road_addr, r.jibun_addr, r.tel, r.homepage,
    r.wd_open, r.wd_close, r.we_open, r.we_close,
    r.hd_open, r.hd_close, r.holiday,
    r.total_cars, r.sedan_cars, r.van_cars, r.ev_sedan_cars, r.ev_van_cars,
    r.fee_light, r.fee_small, r.fee_medium, r.fee_large,
    r.fee_van, r.fee_leisure, r.fee_imported,
    r.lat, r.lng,
    r.data_base_date, r.synced_at
  from rental_cars r
  where r.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
    and (not p_ev_only or coalesce(r.ev_sedan_cars, 0) + coalesce(r.ev_van_cars, 0) > 0)
  order by
    (coalesce(r.ev_sedan_cars, 0) + coalesce(r.ev_van_cars, 0) > 0) desc,
    coalesce(r.total_cars, 0) desc,
    r.place_key
  limit p_limit;
$$;

-- ══ 2) 자동차검사소 ════════════════════════════════════════════════════════
-- 원천: 공공데이터포털 「전국자동차검사소표준데이터」
--   오픈API: https://api.data.go.kr/openapi/tn_pubr_public_car_inspofc_api
--
-- 왜 필요한가(실측): 지금까지 검사소는 정비업체 데이터에서 **업체명에 '검사'가 들어간 것만**
-- 골라내고 있었다(lib/repair/brand.ts). 그 결과 34,172곳 중 121곳만 검사소로 잡혔다.
-- '○○모터스'처럼 간판에 '검사'가 없는 지정정비사업자는 이름만으로는 원천적으로 판별할 수 없다.
-- 전국 검사소는 그보다 훨씬 많으므로, 이름 추측을 버리고 검사소 표준데이터를 직접 쓴다.
--
-- ⚠️ repair_shops 에 합쳐 넣지 않고 **별도 테이블**로 둔다:
--   1) sync-repair 의 stale cleanup(synced_at 기준)이 검사소 행을 통째로 지운다.
--      source 컬럼으로 거르는 방법도 있지만, 이미 운영 중인 sync 를 건드리는 위험을 지지 않는다.
--      (0042 에서 synced_at 누락으로 테이블이 비워진 사고가 실제로 있었다.)
--   2) 검사 종류별 가능 여부는 검사소에만 있는 정보라 정비소 스키마에 섞으면 전부 null 컬럼이 된다.
-- 지도에서는 아래 RPC 가 union 으로 합쳐 정비소 레이어의 'inspection' 브랜드로 함께 내보낸다.

create table if not exists inspection_stations (
  place_key      text primary key,            -- 결정적 합성키(sha256(검사소명|주소) 앞 32자)
  name           text not null,               -- 자동차검사소명
  office_type    text,                        -- 자동차검사소유형(원문: 공단 직영/지정정비사업자 등)
  road_addr      text,
  jibun_addr     text,
  tel            text,
  -- 운영시간은 **원문 그대로** 둔다. 파싱하지 않는다.
  -- 실측(821건): 40%(330건)가 '평일 09:00~18:00+토요일 09:00~13:00' 처럼 구간이 둘 이상이라,
  -- 시작/종료 두 칸으로 쪼개면 토요일 정보가 통째로 사라진다. 채움률은 100% 라 손실이 크다.
  -- 원문에는 '평일(09:00~18:00)' 같은 변형도 있어 안전한 파싱 규칙을 만들 수 없다.
  oper_time      text,
  lane_count     integer,                     -- 검사진로수(규모 지표 — 정렬에 쓴다)
  staff_count    integer,                     -- 검사기술인력수
  -- 검사 종류별 가능 여부. 사용자가 실제로 궁금해하는 값이다(정기검사만 되는지, 튜닝검사도 되는지).
  can_new        boolean,                     -- 신규검사
  can_regular    boolean,                     -- 정기검사
  can_tuning     boolean,                     -- 튜닝검사
  can_temporary  boolean,                     -- 임시검사
  can_repair     boolean,                     -- 수리검사
  can_emission   boolean,                     -- 배출가스정밀검사
  can_taximeter  boolean,                     -- 택시미터검정
  lat            double precision not null,
  lng            double precision not null,
  geom           geography(Point, 4326) not null,
  sigungu_code   text,
  data_base_date date,
  synced_at      timestamptz not null default now()
);

create index if not exists inspection_stations_geom_idx    on inspection_stations using gist (geom);
create index if not exists inspection_stations_synced_idx  on inspection_stations (synced_at);
create index if not exists inspection_stations_sigungu_idx on inspection_stations (sigungu_code);

alter table inspection_stations disable row level security;

-- ══ 3) 정비소 bbox RPC — 검사소를 합쳐 내보낸다 ═══════════════════════════════
-- 0049 의 정의(브랜드 보정 coalesce + 면적 캐스팅 가드)를 유지하면서 검사소를 union 한다.
--
-- 설계 원칙:
--  · 검사소는 brand='inspection' 으로 **고정**해서 나간다. 이름 기반 추측(brand.ts)이 붙인
--    inspection 은 이제 중복이 되므로, repair_shops 쪽에서는 그 브랜드를 걷어낸다(아래 주석 참고).
--  · shop_type 은 'inspection' 으로 내보낸다 — 유형 뱃지가 '자동차검사소'로 뜨게 하기 위함.
--  · 정렬은 두 소스를 합친 뒤 한 번에 한다. 안 그러면 limit 이 한쪽에만 걸린다.
--
-- ⚠️ repair_shops 의 이름 기반 inspection 을 그대로 두면 같은 업체가 두 번 그려질 수 있다.
--    검사소 표준데이터가 더 정확하므로 그쪽을 신뢰하고, 정비소 쪽 inspection 브랜드는
--    null(무소속)로 낮춰 일반 정비소로 그린다. brand.ts 에서 규칙을 제거하는 것과 짝을 이룬다.
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
      -- 정렬용 규모 지표: 면적 문자열에서 숫자만 안전하게 뽑는다.
      -- 전체 일치일 때만 캐스팅한다 — '231.4.4' 같은 값이 실제로 있어 22P02 로 쿼리가 통째로
      -- 죽은 적이 있다(0047). 매칭 통과분만 캐스팅하므로 실패 경로가 없다.
      case
        when regexp_replace(coalesce(r.area, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
        then regexp_replace(coalesce(r.area, ''), '[^0-9.]', '', 'g')::numeric
        else 0
      end as size_rank,
      0 as src_order                          -- 동점 시 정비업체 먼저
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
      -- 마커에는 시간이 필요 없으므로 null 로 내보내고, 상세에서 원문을 그대로 보여준다.
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
    (m.eff_brand is null),                    -- 브랜드 있는 곳 먼저
    case m.shop_type
      when 'inspection' then 0                -- 검사소는 유형 정렬에서 앞에 둔다(희소하고 목적성이 크다)
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

-- ══ 4) 리뷰 대상에 '렌터카'(rental) 추가 ═══════════════════════════════════
-- 0043 이 target_type 을 ('gas','ev','carwash','repair') 로 제한해 뒀다. 렌터카 레이어가
-- 생겼으니 그 목록에 'rental' 을 더한다. 컬럼·인덱스·뷰는 그대로 재사용한다.
--
-- ⚠️ 적용 순서: 이 마이그레이션이 **코드보다 먼저** 적용돼도 안전하다(구 코드는 'rental' 을 쓰지 않는다).
--    반대로 코드가 먼저 나가면 렌터카 리뷰 '작성'만 23514(check 위반)로 실패하고,
--    읽기·다른 장소 리뷰는 정상이다. 지도/상세 페이지가 깨지지는 않는다.
--
-- 0040 의 교훈: `drop constraint if exists` → `add constraint` 순서를 지켜야 재적용이 멱등하다.
alter table reviews drop constraint if exists reviews_target_type_chk;
alter table reviews add constraint reviews_target_type_chk
  check (target_type in ('gas', 'ev', 'carwash', 'repair', 'rental'));
