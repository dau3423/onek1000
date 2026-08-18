-- 1000냥 주유소 - 리뷰 신고
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 동작: 신고 즉시 신고자에게만 그 리뷰가 숨겨진다(개인 숨김). 전역 숨김(reviews.is_hidden)은
--   운영자가 /admin/reviews 에서 판단한다. **자동 전역 숨김은 하지 않는다** — 이 앱은 리뷰가
--   업주 이해관계(가격·품질 평가)와 직결돼 불리한 리뷰를 조직적으로 내릴 동기가 강하고,
--   억울하게 숨겨진 리뷰의 작성자에게는 항의 창구가 없다.
--
-- reviews 와 달리 여기는 외래키를 건다: 대상이 reviews 하나로 확정되고, 리뷰가 지워지면
--   그 신고는 의미가 없으므로 cascade 가 정확한 동작이다.
--
-- 0040 의 교훈: `create ... if not exists` 는 이름만 보고 판단하므로, 먼저 적용된 정의가 있으면
--   나중에 고친 정의는 조용히 무시된다. 이 파일의 객체(review_reports 테이블과 그 인덱스)는
--   지금 버전이 최초 정의이고 이후 재정의할 계획이 없어 이 함정에 해당하지 않는다 — 다만 나중에
--   컬럼을 바꿔야 한다면 반드시 새 마이그레이션 번호로 `alter table` 을 쓰고, 이 파일을 고쳐
--   재적용하는 방식은 쓰지 말 것.

create table if not exists review_reports (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references reviews(id) on delete cascade,
  user_id     uuid not null references users(id)   on delete cascade,
  reason      text not null check (reason in ('spam','abuse','irrelevant','false_info','other')),
  detail      text check (char_length(detail) <= 200),
  resolved_at timestamptz,                  -- 운영자 처리 시각. null = 대기 중
  created_at  timestamptz default now()
);

-- 한 사용자가 같은 리뷰를 여러 번 신고해도 1건
create unique index if not exists review_reports_user_review_unique
  on review_reports (review_id, user_id);

-- 운영자 대기열
create index if not exists review_reports_open_idx
  on review_reports (created_at desc) where resolved_at is null;

-- 개인 숨김 조회용
create index if not exists review_reports_user_idx
  on review_reports (user_id, review_id);

alter table review_reports disable row level security;
