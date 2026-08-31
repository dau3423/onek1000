-- 1000냥 주유소 — EV 충전소 단위 사전집계 테이블
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 문제: rpc_ev_chargers_by_bbox(0011)가 bbox로 거른 **충전기 행 전체**를 group by stat_id 로 묶고
--       order by available_chargers desc 로 정렬한 뒤 limit 을 걸었다. 집계 결과로 정렬하므로
--       LIMIT 이 밀려 내려가지 못해 비용이 화면 안 충전기 수에 그대로 비례했다.
--         ev_chargers 전체        527,093 행
--         서울 광역 bbox 안         39,261 행  → 1.0~8.8초, statement timeout(57014) 빈발
--         강남 일부 bbox              수백 행  → 0.4~0.9초
--       타임아웃이 나면 lib/db/ev.ts 가 throw → 라우트가 빈 본문 500 → 클라이언트가 삼켜서
--       사용자에겐 "충전소가 없는" 것으로 보였다.
--
-- 해법: 충전소 1행으로 미리 집계해 둔다. GROUP BY 가 사라지고 대상 행수가 한 자릿수 배로 준다.
--
-- 신선도 손실 없음: ev_chargers 의 stat 은 원래 "마지막 sync 시점 스냅샷"이고(0011 주석)
--       sync-ev 는 하루 1회 돈다. sync 직후 갱신되는 집계는 원본과 동일한 신선도를 가진다.
--
-- ★ materialized view 를 쓰지 않은 이유:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY 는 트랜잭션 블록 안에서 실행할 수 없는데
--   plpgsql 함수 본문은 항상 트랜잭션이라 함수로 감쌀 수 없다. CONCURRENTLY 를 빼면 refresh 동안
--   ACCESS EXCLUSIVE 락으로 EV 조회가 통째로 막힌다(크론이 13:30 KST 낮시간이라 곤란).
--   일반 테이블에 한 트랜잭션 안에서 DELETE+INSERT 하면 MVCC 로 읽는 쪽은 커밋 전까지 옛 데이터를
--   그대로 보고, 교체는 커밋 시점에 원자적으로 일어난다.

create table if not exists ev_station_summary (
  stat_id            text primary key,
  name               text not null,
  lat                double precision not null,
  lng                double precision not null,
  geom               geography(Point, 4326) not null,
  busi_nm            text,
  total_chargers     int not null,
  available_chargers int not null,
  has_fast           boolean,
  has_slow           boolean,
  max_output         int,
  latest_stat_upd_dt timestamptz,
  synced_at          timestamptz,
  refreshed_at       timestamptz not null default now()
);

-- bbox 조회용 공간 인덱스(0011의 ev_chargers_geom_idx 와 동일 방식).
create index if not exists ev_station_summary_geom_idx
  on ev_station_summary using gist (geom);

-- ─── 집계 갱신 ───
-- sync-ev 가 전국 순회를 마쳤을 때만 호출한다(부분 적재 상태를 노출하지 않기 위해).
-- statement_timeout 을 함수 안에서 올려 잡는다 — Supabase 기본값(~8s)으로는 527k 행 집계가 죽는다.
create or replace function refresh_ev_station_summary()
returns int
language plpgsql
security definer
as $$
declare n int;
begin
  set local statement_timeout = '300s';

  delete from ev_station_summary;

  insert into ev_station_summary (
    stat_id, name, lat, lng, geom, busi_nm,
    total_chargers, available_chargers, has_fast, has_slow,
    max_output, latest_stat_upd_dt, synced_at, refreshed_at
  )
  select
    c.stat_id,
    max(c.stat_nm),
    avg(c.lat),
    avg(c.lng),
    st_setsrid(st_makepoint(avg(c.lng), avg(c.lat)), 4326)::geography,
    max(c.busi_nm),
    count(*)::int,
    count(*) filter (where c.stat = '2')::int,
    -- 급속/완속 판정은 0011의 RPC 와 동일한 식을 그대로 옮긴 것이다.
    bool_or(coalesce(c.output_kw, 0) >= 50 or c.chger_type not in ('02','07','08')),
    bool_or((c.output_kw is not null and c.output_kw < 50) or c.chger_type in ('02','07','08')),
    max(c.output_kw)::int,
    max(c.stat_upd_dt),
    max(c.synced_at),
    now()
  from ev_chargers c
  where coalesce(c.del_yn, false) = false
  group by c.stat_id;

  get diagnostics n = row_count;
  return n;
end $$;

-- ─── bbox 조회 RPC 재작성 ───
-- 시그니처와 반환 컬럼은 0011 과 완전히 동일하다(lib/db/ev.ts 무수정).
--
-- 0011 대비 의미 차이 하나: 예전에는 bbox 안에 든 **충전기만** 세어 집계했고, 지금은 충전소의
-- 전체 충전기를 세고 충전소 대표점(평균 좌표)이 bbox 안인지로 거른다. 한 충전소의 충전기들은
-- 같은 자리에 있으므로 실무상 차이가 없고, 화면 경계에 걸친 충전소의 "총 N대"가 오히려 정확해진다.
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
  select
    s.stat_id, s.name, s.lat, s.lng, s.busi_nm,
    s.total_chargers, s.available_chargers, s.has_fast, s.has_slow,
    s.max_output, s.latest_stat_upd_dt, s.synced_at
  from ev_station_summary s
  where s.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  order by s.available_chargers desc, s.total_chargers desc
  limit p_limit;
$$;

-- 최초 1회 적재 — 이걸 빼면 다음 sync-ev 가 돌 때까지 EV 지도가 비어 보인다.
select refresh_ev_station_summary();
