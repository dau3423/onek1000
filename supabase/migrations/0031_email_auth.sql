-- 이메일 회원가입/로그인 지원 — users에 비밀번호 해시 컬럼 추가.
-- 소셜(OAuth) 사용자는 password_hash가 NULL이고, 이메일 가입 사용자만 값이 채워진다.
-- 해시는 애플리케이션(node:crypto scrypt)에서 'scrypt$N$r$p$salt$hash' 형식으로 저장한다.
alter table users add column if not exists password_hash text;

-- 이메일 로그인 시 email로 단건 조회한다(이미 email은 unique). 별도 인덱스 불필요.
