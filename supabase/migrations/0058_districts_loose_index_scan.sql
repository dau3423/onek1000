-- 1000냥 주유소 — rpc_districts_with_places 를 loose index scan 으로 교체
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 0057 은 `select distinct sigungu_code from ...` 였는데, ev_chargers(527,995행 중 485,404행이
-- non-null)에서 **콜드 호출이 Supabase 문(statement) 타임아웃에 걸린다.**
--
--   2026-09-03 실측(4회 연속):
--     1회차  9.4초  ERROR 57014 canceling statement due to statement timeout
--     2회차  5.7초  208개
--     3회차  3.2초  208개
--     4회차  2.0초  208개
--
-- 즉 캐시가 데워지면 되지만 **빌드 컨테이너는 항상 콜드**라 매번 첫 호출에서 실패한다.
-- distinct 가 인덱스 전체(48만 엔트리)를 훑기 때문이다 — Postgres 에는 loose index scan 이
-- 기본 제공되지 않는다.
--
-- 해법: 재귀 CTE 로 loose index scan 을 직접 구성한다. min() 은 btree 인덱스에서 단일 lookup 이라,
-- 48만 엔트리 스캔이 **고유값 개수(약 208회)만큼의 인덱스 lookup** 으로 바뀐다.
-- 인덱스는 0048 에서 이미 만들어 두었다(repair_shops/carwash_places/ev_chargers_sigungu_idx).
--
-- statement_timeout 도 함께 올려 둔다 — 위 구조로 충분히 빨라지지만, 데이터가 더 커져도
-- 첫 호출이 조용히 실패하지 않도록 하는 안전장치다(빌드가 이것 때문에 죽은 전례가 있다).

create or replace function rpc_districts_with_places(p_layer text)
returns setof text
language plpgsql
stable
as $$
begin
  set local statement_timeout = '30s';

  if p_layer = 'ev' then
    return query
      with recursive t(code) as (
        select min(sigungu_code) from ev_chargers where sigungu_code is not null
        union all
        select (select min(c.sigungu_code) from ev_chargers c where c.sigungu_code > t.code)
        from t where t.code is not null
      )
      select code from t where code is not null;

  elsif p_layer = 'repair' then
    return query
      with recursive t(code) as (
        select min(sigungu_code) from repair_shops where sigungu_code is not null
        union all
        select (select min(r.sigungu_code) from repair_shops r where r.sigungu_code > t.code)
        from t where t.code is not null
      )
      select code from t where code is not null;

  elsif p_layer = 'carwash' then
    return query
      with recursive t(code) as (
        select min(sigungu_code) from carwash_places where sigungu_code is not null
        union all
        select (select min(w.sigungu_code) from carwash_places w where w.sigungu_code > t.code)
        from t where t.code is not null
      )
      select code from t where code is not null;

  else
    return;
  end if;
end $$;
