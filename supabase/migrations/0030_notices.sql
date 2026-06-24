-- 0030: 첫 화면 공지 팝업용 notices 테이블 + storage 버킷
--
-- 목적: 관리자(/admin/notice)가 공지 이미지를 업로드하면 storage에 저장하고,
--   첫 화면(메인) 진입 시 그 이미지를 팝업으로 띄운다. 이미지를 터치하면 link_url로 이동.
--   정책: "단일 활성 공지" — is_active=true 행 중 가장 최근 1건만 노출(/api/notice).
--
-- 멱등: create table/index if not exists + insert ... on conflict do nothing 라 재적용 안전.

-- ─── 1) 공지 테이블 ───
create table if not exists notices (
  id         uuid primary key default gen_random_uuid(),
  image_url  text not null,                         -- 공개 접근 가능한 이미지 URL(공개 버킷)
  image_path text,                                  -- storage 객체 경로(교체 시 이전 이미지 정리용, NULL 허용)
  link_url   text,                                  -- 터치 시 이동할 URL(없으면 단순 공지)
  is_active  boolean not null default true,         -- 노출 여부. 단일 활성: 새 공지 등록 시 이전 활성은 false로.
  created_at timestamptz not null default now()
);

-- ─── 2) 활성 공지 최신 1건 조회 최적화 ───
-- where is_active = true order by created_at desc limit 1.
create index if not exists notices_active_created_idx
  on notices (is_active, created_at desc);

-- ─── 3) RLS ───
-- 기존 서버 전용 테이블(reviews/page_visits 등)과 동일 — service_role로만 접근하므로 RLS 비활성.
alter table notices disable row level security;

-- ─── 4) Storage 버킷(공개 read) ───
-- 공지 이미지는 민감정보가 아니므로 공개 버킷에 올려 안정적인 공개 URL을 그대로 DB에 저장한다
-- (리뷰 사진과 달리 7일 만료 서명 URL을 쓰지 않는다). 멱등: on conflict do nothing.
-- 콘솔에서 버킷을 이미 만들었다면 이 insert는 no-op이 된다.
insert into storage.buckets (id, name, public)
values ('notices', 'notices', true)
on conflict (id) do nothing;
