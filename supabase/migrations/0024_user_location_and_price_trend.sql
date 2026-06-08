-- 0024: 사용자 마지막 위치 저장 + 지역 가격 추세 RPC + 이력 인덱스 보강
--
-- 목적(③/④ 내 지역 가격 알림):
--  - 서버 cron(주간 다이제스트)이 "사용자의 내 지역"을 알아야 하므로, 클라이언트가
--    geolocation으로 얻은 좌표를 users에 가볍게 저장한다(last_lat/last_lng/last_loc_at).
--    인덱스는 두지 않는다(대상 = 좌표+푸시구독 보유자 소규모, 전체 스캔으로 충분).
--  - ④ 가격 추세 배너: 어떤 지점 반경의 prices_history로 "최근 7일 평균 vs 직전 7일 평균"을
--    산출하는 RPC(rpc_price_trend)를 추가한다. 데이터 부족 시 NULL/0건으로 graceful.
--  - prices_history 반경+기간 조회 효율을 위해 (observed_at) 보조 인덱스를 둔다.
--    (기존 (station_id, product, observed_at desc) 인덱스는 station 단건 차트용이라,
--     "여러 station × 기간" 집계에는 기간 선필터가 가능한 observed_at 인덱스가 유리하다.)

-- ─── 사용자 마지막 위치 ───
alter table users add column if not exists last_lat   double precision;
alter table users add column if not exists last_lng   double precision;
alter table users add column if not exists last_loc_at timestamptz;

-- ─── 이력 기간 조회 보조 인덱스 ───
-- 반경 내 여러 주유소의 최근 14일 이력을 모을 때 observed_at으로 기간 선필터한다.
create index if not exists prices_history_pd_at_idx
  on prices_history (product, observed_at desc);

-- ─── 지역 가격 추세 RPC ───
-- 반경(p_radius_m) 내 해당 유종(prices_history)의 직전 14일을 7일씩 둘로 나눠
-- 각 구간 평균가를 구하고, recent(최근 7일) vs prior(직전 7일)를 반환한다.
-- 표본 신뢰를 위해 각 구간 관측치 수(recent_n/prior_n)도 함께 반환한다(애플리케이션에서 임계 판정).
--
-- 설계 노트:
--  - station 좌표는 stations.geom, 이력은 prices_history(좌표 없음)라 station_id로 조인 후 반경 필터.
--  - st_dwithin은 geom & 인덱스를 타고, observed_at 기간은 prices_history_pd_at_idx를 탄다.
--  - 평균은 단순 산술평균(주유소 가중 없음). 추세 "방향" 판단이 목적이라 충분하다.
create or replace function rpc_price_trend(
  p_lat float8, p_lng float8, p_radius_m int, p_product text
)
returns table (
  recent_avg float8, prior_avg float8,
  recent_n bigint,  prior_n bigint
) language sql stable as $$
  with nearby as (
    select s.id
    from stations s
    where st_dwithin(s.geom, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
  ),
  hist as (
    select h.price, h.observed_at
    from prices_history h
    join nearby n on n.id = h.station_id
    where h.product = p_product
      and h.observed_at >= now() - interval '14 days'
  )
  select
    avg(price) filter (where observed_at >= now() - interval '7 days')  as recent_avg,
    avg(price) filter (where observed_at <  now() - interval '7 days')  as prior_avg,
    count(*)   filter (where observed_at >= now() - interval '7 days')  as recent_n,
    count(*)   filter (where observed_at <  now() - interval '7 days')  as prior_n
  from hist;
$$;
