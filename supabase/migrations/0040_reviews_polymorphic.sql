-- 1000냥 주유소 - 리뷰 다형화(주유소 전용 → 장소 공통)
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 배포 순서 양방향 안전이 이 마이그레이션의 핵심이다:
--   - 마이그레이션 먼저 / 코드 나중: 구버전 코드는 station_id 만 넣는다. target_type 의 default 'gas' 가
--     값을 채우고 target_id 는 null 로 남으며, 조회가 coalesce(target_id, station_id) 를 쓰므로
--     정상 동작한다. default 가 없으면 이 순서에서 운영 중 리뷰 작성이 즉시 실패한다.
--   - 코드 먼저 / 마이그레이션 나중: 신버전 코드가 컬럼 부재를 감지해 기존 station_id 경로로 동작한다.
--
-- FK 를 제거하는 이유: 대상 테이블이 셋(stations/ev_chargers/carwash_places)이라 한 컬럼으로 FK 를
--   걸 수 없고, EV 는 충전기당 1행이라 충전소 단위 FK 대상 자체가 없다. 존재 검증은 애플리케이션이 한다.
--
-- 멱등: add column if not exists / create index if not exists / create or replace 라 재적용 안전.

alter table reviews add column if not exists target_type text not null default 'gas';
alter table reviews add column if not exists target_id   text;

alter table reviews drop constraint if exists reviews_station_id_fkey;
alter table reviews alter column station_id drop not null;

alter table reviews drop constraint if exists reviews_target_type_chk;
alter table reviews add constraint reviews_target_type_chk
  check (target_type in ('gas','ev','carwash'));

-- 사용자당 대상당 1개.
-- 신버전 코드가 upsert 의 충돌 대상으로 지정할 수 있어야 하므로 표현식이 아닌 평범한 인덱스로 둔다
-- (ON CONFLICT 와 PostgREST onConflict 는 컬럼 이름만 받는다).
--
-- 주의(운영 중 실제로 겪은 문제): `if not exists` 는 이름으로만 판단하고 정의 변경은 보지 않는다.
-- 이 파일의 이전 초안(coalesce(target_id, station_id) 표현식 인덱스)을 이미 손으로 적용한
-- 적이 있다면, 이 문장은 이름이 같다는 이유로 아무 일도 하지 않고 조용히 넘어간다 — 즉 옛
-- 표현식 인덱스가 그대로 남는다. 이 저장소는 마이그레이션을 손으로 적용하므로, 이전 초안을
-- 이미 돌렸다면 재적용 전에 반드시 아래로 인덱스를 지우고 다시 만들어야 한다:
--   drop index if exists reviews_user_target_unique;
create unique index if not exists reviews_user_target_unique
  on reviews (user_id, target_type, target_id);

-- 구버전 코드의 upsert 가 onConflict: 'user_id,station_id' 를 쓴다. Postgres 의 ON CONFLICT 는
-- 정확히 그 컬럼 조합의 유니크 인덱스를 요구하므로, 이 인덱스를 지우면 마이그레이션이 코드보다
-- 먼저 적용되는 순서에서 주유소 리뷰 작성이 전부 42P10 으로 실패한다.
-- ev/carwash 행은 station_id 가 null 이고 Postgres 는 유니크 인덱스에서 NULL 을 서로 다르게 보므로
-- 이 인덱스가 그 행들을 제약하지 않는다 — 두 인덱스는 공존해도 충돌하지 않는다.
-- 구버전 라우트(app/api/stations/[id]/reviews/route.ts)를 제거한 뒤 별도로 정리한다.
create unique index if not exists reviews_user_station_unique
  on reviews (user_id, station_id);

create index if not exists reviews_target_idx
  on reviews (target_type, coalesce(target_id, station_id), created_at desc)
  where is_hidden = false;

-- 장소 공통 별점 요약. 기존 station_review_stats 는 지우지 않는다 —
-- 지우면 그 뷰를 읽는 기존 코드가 적용 즉시 깨진다. 소비자 이전 후 별도로 정리한다.
create or replace view place_review_stats as
select target_type,
       coalesce(target_id, station_id) as target_id,
       count(*)                        as review_count,
       round(avg(rating)::numeric, 1)  as rating_avg,
       count(*) filter (where rating = 5) as r5,
       count(*) filter (where rating = 4) as r4,
       count(*) filter (where rating = 3) as r3,
       count(*) filter (where rating = 2) as r2,
       count(*) filter (where rating = 1) as r1
from reviews
where is_hidden = false
group by target_type, coalesce(target_id, station_id);
