-- 0013: 내 기록에 전기차 충전 기록 통합 (fuel_logs 확장)
-- 마이페이지에서 주유 기록과 충전 기록을 "하나의 내 기록"으로 함께 보기 위해
-- 별도 테이블 대신 기존 fuel_logs를 확장한다.
--   - kind: 'gas'(주유, 기본) | 'ev'(전기차 충전). 기존 행은 모두 'gas'로 간주.
--   - kwh : 전기차 충전량(kWh). 주유 기록에선 사용하지 않음(null).
-- EV 기록의 필드 재해석:
--   station_id   = 충전소 ID(EV statId)
--   station_name = 충전소명(스냅샷)
--   product      = 'EV'(유종 코드 자리 재사용. EV는 유종 개념이 없어 고정값)
--   unit_price   = 충전 단가(원/kWh). 1클릭 시점엔 비워두고(null) 나중 편집
--   kwh          = 충전량(kWh). 나중 편집
--   amount_won   = 충전 금액(원). 나중 편집
--   odometer/memo = 주유와 공용
--
-- 멱등: 새 컬럼은 add column if not exists + 기본값/nullable이라 기존 동작이 깨지지 않는다.
-- 운영 적용 전에도 기존 주유 기록(kind 기본 'gas')은 그대로 동작한다.

alter table fuel_logs
  add column if not exists kind text not null default 'gas';

alter table fuel_logs
  add column if not exists kwh numeric(8,2);

-- 종류별 필터/통계를 대비한 보조 인덱스(사용자×종류×최신순).
create index if not exists fuel_logs_user_kind_logged_idx
  on fuel_logs (user_id, kind, logged_at desc);
