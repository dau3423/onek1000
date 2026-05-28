-- 0004: 주유소 리뷰 (별점/텍스트/사진)
-- Storage: 사진은 'review-photos' 버킷에 저장. 이 파일은 테이블만 다룸.
--          버킷 생성은 docs/06_배포_firebase.md 또는 README 참고.

create table if not exists reviews (
  id          uuid primary key default gen_random_uuid(),
  station_id  text not null references stations(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  content     text check (char_length(content) <= 500),
  photo_paths text[] default '{}',          -- storage 객체 경로 배열. URL은 클라가 서명URL 발급
  is_hidden   boolean default false,        -- 모더레이션용
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 한 사용자가 같은 주유소에 한 번만 리뷰 (수정만 허용)
create unique index if not exists reviews_user_station_unique
  on reviews (user_id, station_id);

create index if not exists reviews_station_idx
  on reviews (station_id, created_at desc) where is_hidden = false;
create index if not exists reviews_user_idx
  on reviews (user_id, created_at desc);

-- ─── 주유소별 별점 요약 뷰 ───
create or replace view station_review_stats as
select
  station_id,
  count(*)                       as review_count,
  round(avg(rating)::numeric, 1) as rating_avg,
  count(*) filter (where rating = 5) as r5,
  count(*) filter (where rating = 4) as r4,
  count(*) filter (where rating = 3) as r3,
  count(*) filter (where rating = 2) as r2,
  count(*) filter (where rating = 1) as r1
from reviews
where is_hidden = false
group by station_id;

-- ─── RLS ───
-- service_role 키로만 접근하므로 비활성 (다른 마이그레이션과 통일)
alter table reviews disable row level security;

-- ─── 사진 경로 정리 트리거: 리뷰 삭제 시 storage 객체도 정리 필요 ───
-- 실제 storage 삭제는 API Routes에서 처리. 여기선 DB만.
create or replace function set_review_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists reviews_set_updated_at on reviews;
create trigger reviews_set_updated_at
  before update on reviews
  for each row execute function set_review_updated_at();
