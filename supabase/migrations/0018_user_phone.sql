-- 0018: 사용자 휴대폰번호 수집·저장
-- 알림톡 발송(수신 동의 ON 사용자 대상) + 결제 화면 휴대폰번호 프리필 용도로
-- users 테이블에 휴대폰번호 컬럼을 추가한다. nullable(미입력 허용).
-- 저장 형식은 하이픈 없는 숫자(예: 01012345678) — 정규화/검증은 서버(API)가 담당한다.
--
-- 개인정보(휴대폰번호) 컬럼이므로 불필요한 노출/로깅을 금지한다(서버 스코프에서만 사용).
--
-- 적용: Supabase SQL Editor 또는 `supabase db push`. (운영 DB에 직접 적용 금지 — 코드 배포와 함께 적용 권장)
-- 멱등: add column if not exists 이므로 재적용 안전.

alter table users add column if not exists phone text;
