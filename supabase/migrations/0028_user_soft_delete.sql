-- 0028: 회원 탈퇴 소프트삭제(deleted_at) 전환
--
-- 배경(정책 확정):
--   회원 탈퇴 시 users 행과 연관 데이터(즐겨찾기/주유기록/리뷰/푸시구독/관심지역/차량 등)를
--   삭제하지 않고, users.deleted_at 타임스탬프로 "탈퇴 상태"만 구분한다.
--   - 같은 소셜계정으로 재로그인하면 deleted_at을 NULL로 되돌려 계정·데이터를 그대로 복원한다.
--   - 개인정보(email/name 등)는 이번 정책상 마스킹/익명화하지 않고 그대로 보존한다.
--
-- 주의:
--   - 기존 CASCADE FK는 그대로 둔다(향후 하드삭제/운영 정리 시 연쇄삭제가 필요하므로).
--     탈퇴 엔드포인트가 더 이상 DELETE FROM users 를 하지 않으므로 평소엔 연쇄삭제가 일어나지 않는다.
--   - 탈퇴자 제외(deleted_at IS NULL)는 애플리케이션 레이어(푸시 발송/인증 등)에서 처리한다.
--
-- 멱등: add column if not exists / create index if not exists 라 재적용 안전.

-- ─── 1) 탈퇴 타임스탬프 ───
-- NULL = 활성 회원, 값 있음 = 해당 시각에 탈퇴(소프트삭제).
alter table users add column if not exists deleted_at timestamptz;

-- ─── 2) 활성 회원 조회 최적화용 부분 인덱스 ───
-- 푸시 발송/집계 등 활성 사용자만 스캔하는 경로(deleted_at IS NULL)를 가볍게 한다.
create index if not exists users_active_idx on users (id) where deleted_at is null;
