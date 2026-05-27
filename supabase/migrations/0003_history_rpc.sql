-- 0003: 가격 이력 일자별 RPC
-- 일자별 마지막 관측값 (해당일 최종 가격)을 series로 반환

create or replace function rpc_price_history_daily(
  p_station_id text,
  p_product    text,
  p_since      timestamptz
)
returns table (day date, price int) language sql stable as $$
  select distinct on (date_trunc('day', observed_at))
         date_trunc('day', observed_at)::date as day,
         price
  from prices_history
  where station_id = p_station_id
    and product    = p_product
    and observed_at >= p_since
  order by date_trunc('day', observed_at) desc, observed_at desc;
$$;
