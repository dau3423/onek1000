-- 0017: 카카오 알림톡 수신 동의 여부
-- 사용자가 마이페이지에서 카카오 알림톡(주유 할인·이벤트 등) 수신을 켜고 끌 수 있게
-- users 테이블에 동의 플래그를 추가한다. 기본값은 미동의(false).
-- 실제 발송 연동(비즈채널/발송사 + 휴대폰번호 수집)은 후속 작업이며, 이 마이그레이션은 설정 저장만 담당한다.
--
-- 적용: Supabase SQL Editor 또는 `supabase db push`. (운영 DB에 직접 적용 금지 — 코드 배포와 함께 적용 권장)
-- 멱등: add column if not exists 이므로 재적용 안전.

alter table users add column if not exists alimtalk_opt_in boolean not null default false;
