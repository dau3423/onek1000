-- 0007: 사용자 닉네임
-- 소셜 제공 이름(name)과 분리된 표시용 닉네임. 첫 로그인 시 자동 생성하고,
-- 마이페이지에서 변경할 수 있다. 공백 제거 + 소문자 정규화 기준으로 유니크 보장.

alter table users add column if not exists nickname text;

-- 길이 안전망: 한글/영문/숫자 모두 char_length로 1자=1로 세어진다.
-- 최소 2자, 최대 10자(NULL은 제약을 통과 → 기존 사용자가 닉네임 없이 공존 가능).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_nickname_len_chk'
  ) then
    alter table users add constraint users_nickname_len_chk
      check (nickname is null or char_length(nickname) between 2 and 10);
  end if;
end $$;

-- 정규화 유니크: 공백 제거 + 소문자화. 한국어는 lower() 영향 없음.
-- (NULL은 인덱스에서 제외되어 기존 사용자가 닉네임 없이 공존 가능)
create unique index if not exists users_nickname_norm_idx
  on users (lower(replace(nickname, ' ', '')))
  where nickname is not null;
