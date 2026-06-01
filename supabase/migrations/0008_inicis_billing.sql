-- KG이니시스 결제 연동으로 전환 (토스 → 이니시스)
-- 적용은 운영자가 직접 수행. (이 파일은 작성만)
--
-- 변경 요약:
--  1) subscriptions: 결제대행사/플랜종류/이니시스 식별자/만료형 단건 표현용 컬럼 추가
--  2) billing_events: 이니시스 tid/oid 컬럼 추가(기존 toss_* 컬럼은 유지 — 하위호환)
--  3) billing_pending: 결제창 시작~승인 사이의 주문 매핑 테이블(oid → user/plan) 신설

-- ─── subscriptions 확장 ───
alter table subscriptions
  add column if not exists provider     text not null default 'inicis',   -- 'inicis' / (구) 'toss'
  add column if not exists plan_type     text not null default 'recurring', -- 'recurring'(정기) / 'onetime'(단건 만료형)
  add column if not exists inicis_tid    text,                              -- 최근 승인 거래번호(TID)
  add column if not exists expires_at    timestamptz;                       -- 단건: 이용 만료 시각

-- billing_key는 정기결제(빌링키)에서만 채워짐. 단건은 null.
comment on column subscriptions.billing_key is 'KG이니시스 빌링키(CARD_BillKey). 정기결제에서만 사용';
comment on column subscriptions.customer_key is '가맹점 사용자 식별자(oid 접두 등). 이니시스는 필수 아님';

-- ─── billing_events 확장 ───
alter table billing_events
  add column if not exists provider  text default 'inicis',
  add column if not exists tid       text,   -- 이니시스 거래번호
  add column if not exists oid       text;   -- 이니시스 주문번호

-- ─── billing_pending: 결제창 시작 시점에 기록, 승인 시 소비 ───
-- returnUrl 위변조 방지: 클라이언트가 보낸 oid가 우리가 발급한 것인지, 어떤 user/plan인지 서버에서 확인.
create table if not exists billing_pending (
  oid         text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  plan        text not null,            -- onetime_1000 / monthly_1000
  mode        text not null,            -- pay / billing
  amount      integer not null,
  status      text not null default 'created',  -- created / consumed
  created_at  timestamptz default now(),
  consumed_at timestamptz
);
create index if not exists billing_pending_user_idx on billing_pending (user_id, created_at desc);

alter table billing_pending disable row level security;
