-- 0023: 친구 추천(레퍼럴) 기능
-- 추천 링크(?ref=<code>)로 신규 가입이 성사되면 추천인·피추천인 둘 다 프리미엄 +7일.
--
-- 설계:
--  - referral_code: 사용자별 고유 추천코드(짧은 base62, 6~8자리). 가입 시 또는 첫 조회 시
--    lazy 발급한다. 추측 무의미(보상은 신규 가입자에게만, 멱등) + unique로 충돌 방지.
--  - referred_by: 이 사용자를 추천한 사람의 user_id. null이면 아직 미추천(1인 1회만 클레임).
--    자기 자신 추천은 애플리케이션에서 금지(코드 == 본인). 멱등: 이미 set이면 no-op.
--  - on delete set null: 추천인이 탈퇴해도 피추천인 행은 보존하고 링크만 끊는다(0001 users
--    on delete cascade 흐름과 충돌 없음 — 여기선 자기참조라 set null이 안전).

alter table users add column if not exists referral_code text unique;
alter table users add column if not exists referred_by uuid references users(id) on delete set null;

-- referral_code 조회(claim 시 code→추천인 user_id)는 unique 제약이 곧 인덱스 역할을 한다.
-- referred_by는 "추천 성공 N명"(referred_by = 나) 집계에 쓰이므로 별도 인덱스를 둔다.
create index if not exists users_referred_by_idx on users (referred_by);
