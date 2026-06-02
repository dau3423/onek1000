-- 1000냥 주유소 - 부가서비스(편의점/세차/경정비/품질인증/LPG겸업) 컬럼
-- Supabase SQL Editor 또는 supabase db push 로 적용.
--
-- 배경: 일 1회 가격 sync는 lowTop10.do(area=시군구)로 가격을 적재하는데,
-- 이 응답에는 부가서비스 필드가 없다. 부가서비스(CAR_WASH_YN/CVS_YN/MAINT_YN/
-- KPETRO_YN/LPG_YN)는 Opinet detailById.do(주유소 1건당 1콜)에서만 온다.
-- Opinet 일일 한도(~1,500)와 가격 sync(~1,020콜) 때문에 전 주유소를 매일 보강할 수 없어,
-- sync 말미에 amenities_updated_at이 오래된 순으로 N건씩 회전 보강한다(아래 sync 라우트 참조).
-- 이 컬럼들이 그 보강 결과를 영구 저장하며, 상세보기는 이 DB만 읽는다(Opinet 호출 0건).

-- has_carwash / has_cvs / has_maintenance 는 0001_init.sql 에 이미 존재.
alter table stations
  add column if not exists has_lpg              boolean default false,  -- LPG 겸업 여부(LPG_YN='Y'/'C')
  add column if not exists is_kpetro            boolean default false,  -- 품질인증주유소 여부(KPETRO_YN='Y')
  add column if not exists amenities_updated_at timestamptz;            -- 부가서비스 마지막 보강 시각(null=미보강)

-- 회전 보강 시 "가장 오래된(또는 미보강) 주유소 N건"을 빠르게 뽑기 위한 인덱스.
-- nulls first 정렬을 우선 처리하도록 정렬 방향을 맞춘다.
create index if not exists stations_amenities_refresh_idx
  on stations (amenities_updated_at asc nulls first);
