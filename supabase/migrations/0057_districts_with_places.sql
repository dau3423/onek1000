-- 1000냥 주유소 — 레이어별 "데이터가 있는 시군구" 조회 RPC
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 배경: /regions/[region]/[district]/[layer] 의 generateStaticParams 가 레이어마다
--       "데이터가 있는 시군구 코드 집합"을 구한다. PostgREST 에 distinct 가 없어
--       lib/db/placeRegions.ts 가 테이블 전체를 1,000행씩 페이지네이션하며 훑었다.
--
--       그 코드의 주석은 "값이 짧아 수십만 행이어도 부담이 크지 않고, 빌드에서 한 번만 돈다"
--       였는데, sync-ev 가 전국을 채우며 ev_chargers 가 527,093행까지 커지면서 깨졌다.
--
--       2026-09-02 실측(로컬 → Supabase):
--         repair_shops     12.4초   33페이지   32,148행
--         carwash_places    3.2초   11페이지   10,111행
--         ev_chargers      90초 초과 (228,000행까지) → 전량이면 약 210초
--
--       Next.js 의 staticPageGenerationTimeout 기본값이 60초라 App Hosting 빌드가
--       "Collecting page data for /regions/[region]/[district]/[layer] is still timing out"
--       으로 실패했다. 코드는 그대로인데 데이터가 자라서 빌드가 죽은 사례다.
--
-- 해법: 528회 왕복 대신 SQL 한 번. sigungu_code 인덱스(0048)가 있어 index-only scan 이 된다.

-- p_layer 를 if 로 분기해 동적 SQL 을 쓰지 않는다(테이블명 주입 불가).
-- 알 수 없는 레이어는 빈 결과 — 호출부가 "데이터 없음"으로 처리한다.
create or replace function rpc_districts_with_places(p_layer text)
returns setof text
language plpgsql
stable
as $$
begin
  if p_layer = 'ev' then
    return query select distinct c.sigungu_code from ev_chargers c where c.sigungu_code is not null;
  elsif p_layer = 'repair' then
    return query select distinct r.sigungu_code from repair_shops r where r.sigungu_code is not null;
  elsif p_layer = 'carwash' then
    return query select distinct w.sigungu_code from carwash_places w where w.sigungu_code is not null;
  else
    return;
  end if;
end $$;
