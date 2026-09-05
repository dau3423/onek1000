-- 1000냥 주유소 — 0058 수정: STABLE 함수에서 SET 을 쓸 수 없다
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 0058 이 `stable` 로 선언한 함수 안에 `set local statement_timeout` 을 넣어 실행 자체가 실패했다:
--
--   ERROR 0A000: SET is not allowed in a non-volatile function
--
-- Postgres 는 STABLE/IMMUTABLE 함수에서 SET 을 허용하지 않는다(VOLATILE 만 가능).
-- 0055 의 refresh_ev_station_summary() 에서 쓴 패턴을 그대로 옮긴 게 원인인데, 그쪽은
-- volatile(기본값)이라 문제가 없었다.
--
-- 결과적으로 0058 적용 후 세 레이어가 전부 에러였다(0057 보다 나빠졌다 — 그때는 repair/carwash 는
-- 정상이었다). 호출부가 폴백 페이지네이션으로 내려가 빌드는 살았지만, 정적 페이지 수가 줄었다.
--
-- ■ 수정: statement_timeout 설정을 뺀다. VOLATILE 로 바꾸지 않는다.
--
-- 애초에 그 안전장치가 필요 없다. loose index scan 의 비용은 **행 수가 아니라 고유값 개수**에
-- 비례하는데, sigungu_code 의 고유값은 전국 시군구 수(약 229개)가 상한이다. ev_chargers 가
-- 50만에서 500만 행이 되어도 인덱스 lookup 횟수는 그대로다. 타임아웃을 걱정할 구조가 아니다.
-- 반대로 VOLATILE 로 바꾸면 읽기 전용 함수를 쓰기 함수로 잘못 선언하는 셈이라 옳지 않다.
--
-- ※ 0058 의 재귀 CTE 본문은 SET 에서 먼저 죽어 **한 번도 실행된 적이 없다.** 이 마이그레이션으로
--    처음 검증된다.

create or replace function rpc_districts_with_places(p_layer text)
returns setof text
language plpgsql
stable
as $$
begin
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
