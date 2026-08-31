-- 1000냥 주유소 — 해골 주유소 on-demand 가격 캐시
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 배경: Opinet 무료 API는 일일 1,500콜 한도라 전 주유소 가격을 배치로 받을 수 없다.
--       sync-opinet 은 시군구별 최저가 TOP10 만 prices_latest 에 적재하고, 나머지("해골 주유소")는
--       위치만 남는다. 해골 주유소는 사용자가 상세에 들어올 때 detailById 1회로 실시간 조회한다
--       (lib/db/queries.ts queryStationDetailWithPriceFallback).
--
-- 이 테이블이 필요한 이유: 그 실시간 조회 결과를 담아둘 곳이 지금까지 Redis 뿐이었는데,
--       프로덕션에서 Redis 가 비활성이라 저장이 no-op 이 되어 **같은 주유소를 보는 모든 요청이
--       매번 새 Opinet 콜을 썼다.** 배치 예산(sync ~1,420 + backfill 500)이 이미 한도를 거의
--       채우도록 설계돼 있어, 상한 없는 상세 조회가 늘면 배치 예산까지 잠식한다.
--       DB 에 담으면 인스턴스 재시작·다중 인스턴스와 무관하게 주유소당 하루 1콜로 묶인다.
--
-- ★ prices_latest 에는 절대 쓰지 않는다. 지도 bbox/마커 쿼리는 prices_latest 만 보므로,
--   여기에 적재해도 "비순위 주유소는 가격 마커로 뜨지 않는다"는 마커 불변 보장이 유지된다.

create table if not exists prices_ondemand (
  station_id text not null,                      -- stations.id (Opinet UNI_ID)
  product    text not null,                      -- 유종 코드(B027/B034/D047/K015/C004)
  price      integer not null,
  trade_dt   text,                               -- Opinet TRADE_DT (원문 보존, 'YYYYMMDD')
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,               -- KST 자정(가격 갱신 주기와 일치)
  primary key (station_id, product)
);

-- 상세 조회 핵심 경로: station_id 로 미만료 행을 읽는다.
create index if not exists prices_ondemand_expires_idx
  on prices_ondemand (station_id, expires_at);

-- ─── 전역 쿨다운 플래그 ───
-- Opinet 이 무효/빈/타임아웃 응답을 준 뒤 일정 시간 헛호출을 막는다.
-- 주유소 단위가 아니라 전역이므로 1행짜리 테이블로 둔다(키 고정).
create table if not exists opinet_cooldown (
  id         boolean primary key default true check (id),   -- 항상 단일 행
  reason     text,                                          -- 'empty' | 'timeout' | 'error' (진단용)
  until      timestamptz not null,
  updated_at timestamptz not null default now()
);
