-- 비밀번호 재설정 토큰 — 이메일 가입자가 비밀번호를 잊었을 때 재설정 링크 검증에 사용.
-- 평문 토큰은 저장하지 않고 sha256 해시(token_hash)만 보관한다(DB 유출 시 토큰 도용 방지).
-- 만료(expires_at)·1회용(used_at) 검증으로 재사용/무한 유효를 막는다.
create table if not exists password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz default now()
);

-- 재설정 시 token_hash로 단건 조회, 정리/재요청 시 user_id로 조회한다.
create index if not exists password_reset_tokens_hash_idx on password_reset_tokens (token_hash);
create index if not exists password_reset_tokens_user_idx on password_reset_tokens (user_id);
