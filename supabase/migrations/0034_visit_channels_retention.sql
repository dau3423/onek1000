-- 0034: 유입 채널(referrer/UTM) 기록 컬럼 + 디바이스 기준 D1/D7 코호트 리텐션 RPC + 오늘 채널 집계
--
-- 배경(성장 계기판 2/2):
--   - page_visits(0029)에 유입 채널을 남긴다. document.referrer의 "호스트만"(경로/쿼리 제외) +
--     URL의 utm 3종. (visit_date, device_id) upsert는 ignoreDuplicates라 하루 첫 방문의 채널만
--     남는 first-touch(의도된 동작). 개인정보 최소수집: 호스트/utm 한정, 무작위 UUID 유지.
--   - 기존 (visit_date × device_id) 원천만으로 D1/D7 재방문율을 "소급" 산출한다. 배포 즉시 값이 보인다.
--
-- 지표 정의(고정):
--   - D1: 기준일에 방문한 고유 디바이스 중 "익일(+1)"에도 방문한 비율. "최근 N일(기본 7)" 평균.
--   - D7: 기준일에 방문한 고유 디바이스 중 "정확히 7일 뒤(+7)"에 방문한 비율. "최근 N주(기본 4)" 평균.
--   - 둘 다 각 기준일의 재방문율을 구해 기준일들에 대해 단순 평균한다(코호트=기준일).
--   - 값은 백분율(0~100, 소수1자리) 또는 데이터 부족 시 NULL → 대시보드 '-' 폴백.
--   - "오늘"은 KST(Asia/Seoul) 기준. visit_date(앱이 KST로 계산해 저장)와 경계를 맞춘다.
--
-- 해석 한계: 디바이스(쿠키) 기준이라 쿠키 삭제·브라우저 변경·사파리 ITP로 실제보다 낮게 잡힐 수 있다.
--   절대값보다 주간 추이 비교 용도(대시보드 라벨에 명시).
--
-- 멱등: add column if not exists / create index if not exists / create or replace 라 재적용 안전.

-- ─── 1) 유입 채널 컬럼(모두 nullable) ───
alter table page_visits add column if not exists ref_host     text;  -- referrer 호스트만(경로/쿼리 제외), 직접유입=NULL
alter table page_visits add column if not exists utm_source   text;  -- utm_source (예: naver_blog)
alter table page_visits add column if not exists utm_medium   text;  -- utm_medium (예: social)
alter table page_visits add column if not exists utm_campaign text;  -- utm_campaign

-- ─── 2) 리텐션 self-join 최적화 ───
-- 코호트 RPC는 "같은 device_id의 특정 날짜 존재 여부"를 반복 조회한다.
-- 기존 유니크 인덱스는 (visit_date, device_id)라 device_id 선두 조회엔 불리 → (device_id, visit_date) 추가.
create index if not exists page_visits_device_date_idx on page_visits (device_id, visit_date);

-- ─── 3) D1 코호트 RPC ───
-- 기준일 d ∈ [오늘-days, 오늘-1] (각 기준일은 익일이 오늘 이하라 +1 관측이 완결됨).
create or replace function retention_d1(days int default 7)
returns numeric
language sql stable as $$
  with kst as (select (now() at time zone 'Asia/Seoul')::date as today),
  base as (
    select distinct v.visit_date, v.device_id
    from page_visits v, kst
    where v.visit_date between (kst.today - days) and (kst.today - 1)
  ),
  per_day as (
    select b.visit_date,
           count(*) as cohort,
           count(*) filter (
             where exists (
               select 1 from page_visits n
               where n.device_id = b.device_id
                 and n.visit_date = b.visit_date + 1
             )
           ) as retained
    from base b
    group by b.visit_date
  )
  select case when count(*) > 0
              then round(avg(retained::numeric / cohort) * 100, 1)
              else null end
  from per_day;
$$;

-- ─── 4) D7 코호트 RPC ───
-- 기준일 d ∈ [오늘-7-(weeks*7-1), 오늘-7] (각 기준일은 +7 관측이 완결됨) → weeks*7 개의 기준일.
create or replace function retention_d7(weeks int default 4)
returns numeric
language sql stable as $$
  with kst as (select (now() at time zone 'Asia/Seoul')::date as today),
  base as (
    select distinct v.visit_date, v.device_id
    from page_visits v, kst
    where v.visit_date between (kst.today - (7 + weeks * 7 - 1)) and (kst.today - 7)
  ),
  per_day as (
    select b.visit_date,
           count(*) as cohort,
           count(*) filter (
             where exists (
               select 1 from page_visits n
               where n.device_id = b.device_id
                 and n.visit_date = b.visit_date + 7
             )
           ) as retained
    from base b
    group by b.visit_date
  )
  select case when count(*) > 0
              then round(avg(retained::numeric / cohort) * 100, 1)
              else null end
  from per_day;
$$;

-- ─── 5) 특정 날짜(KST)의 유입 채널별 방문 수(내림차순) ───
-- 채널 = utm_source(있으면) > ref_host(있으면) > '직접'(referrer 없음/직접 유입).
-- 대시보드에서 상위 3개만 취해 "직접 92 · google.com 31 · naver.com 12" 형태로 표시.
create or replace function visit_channels(d date)
returns table(channel text, visits bigint)
language sql stable as $$
  select coalesce(nullif(utm_source, ''), nullif(ref_host, ''), '직접') as channel,
         count(*) as visits
  from page_visits
  where visit_date = d
  group by 1
  order by visits desc, channel;
$$;
