-- 0035: 접속 지역(시도) 컬럼 + 최근 N일 시도별 방문 집계 RPC
--
-- 배경(관리자 지역별 접속 집계 지도):
--   - page_visits(0029~0034)에 접속 IP로부터 "추정한 시도 코드"만 남긴다. 서버(/api/visit)가
--     GeoLite2로 IP→시도 변환을 수행하고, 그 결과(sido_code)만 저장한다.
--   - **IP 원본은 저장하지 않는다**(0029 "IP 미저장" 원칙 유지 — IP는 rate limit·지역 추정에만 쓰고
--     변환 결과인 시도 코드만 남긴다). 개인 좌표·정밀 위치도 저장하지 않는다(시도 단위까지만).
--   - (visit_date, device_id) upsert는 ignoreDuplicates라, 하루 첫 방문의 지역만 남는
--     first-touch 의미론(0034 채널과 동일 — 의도된 동작).
--
-- 프로덕션 적용: **이 마이그레이션은 운영자가 Supabase(SQL Editor 등)에서 수동 실행한다**
--   (이번 세션/코드 배포 범위 아님). 코드가 0035보다 먼저 배포되는 창에서는 recordVisit이
--   sido_code 컬럼 부재 에러를 감지해 해당 필드를 제외하고 재시도하므로(lib/db/stats.ts)
--   방문 기록은 유실되지 않는다.
--
-- 멱등: add column if not exists / create index if not exists / create or replace 라 재적용 안전.

-- ─── 1) 접속 지역(시도) 컬럼 ───
-- Opinet 시도 코드('01'~'19', types/station.ts SidoCode). GeoIP 실패/미상/미도입은 NULL('미상').
alter table page_visits add column if not exists sido_code text;

-- ─── 2) 기간 집계용 인덱스 ───
create index if not exists page_visits_date_sido_idx on page_visits (visit_date, sido_code);

-- ─── 3) 최근 N일(기본 7) 시도별 방문 수 ───
-- KST 기준 최근 days일(오늘 포함). 행이 (일 × 디바이스) 유니크라 count(*)가 곧 고유 방문 수.
-- NULL(지역 추정 실패='미상') 그룹도 필터 없이 결과에 포함한다 — 대시보드가 '미상' 비중을
-- 정직하게 노출하는 데이터 원천이다(where sido_code is not null 필터를 두지 않는다).
create or replace function visit_regions(days int default 7)
returns table(sido_code text, visits bigint)
language sql stable as $$
  with kst as (select (now() at time zone 'Asia/Seoul')::date as today)
  select v.sido_code, count(*) as visits
  from page_visits v, kst
  where v.visit_date between (kst.today - (days - 1)) and kst.today
  group by v.sido_code;
$$;
