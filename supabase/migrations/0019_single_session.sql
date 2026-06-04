-- 0019: 중복 로그인 방지(1계정 1세션, last-login-wins)
-- JWT 세션 전략이라 서버에 세션 row가 없다. 대신 users에 "현재 유효한 세션 식별자"를
-- 보관하고, 매 로그인마다 새 식별자를 발급해 갱신한다. JWT 토큰에 박힌 식별자와
-- DB의 최신 식별자가 다르면(= 다른 기기에서 더 나중에 로그인) 그 토큰은 무효 세션으로 본다.
--
-- 왜 컬럼 1개로 충분한가:
--  - "마지막 로그인만 유효"하면 되므로 활성 세션은 항상 1개 → 단일 식별자만 저장하면 된다.
--  - 별도 sessions 테이블/조인 없이 jwt 콜백의 기존 users 조회에 컬럼만 얹어 검증한다.
--  - 동시 로그인(경합) 시에도 update가 마지막에 쓴 값이 최종 승자가 되어 자연히 last-login-wins.

alter table users add column if not exists session_id text;

-- 무효 세션 검증 조회(email→session_id)는 jwt 콜백에서 매 캐시 주기마다 일어난다.
-- email은 이미 unique이므로 별도 인덱스는 불필요하다(여기선 컬럼만 추가).
