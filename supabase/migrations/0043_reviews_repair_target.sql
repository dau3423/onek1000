-- 1000냥 주유소 - 리뷰 대상에 '정비소'(repair) 추가
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 0040 이 target_type 을 ('gas','ev','carwash') 로 제한해 뒀다. 정비소 레이어(0042)가 생겼으니
-- 그 목록에 'repair' 를 더한다. 컬럼·인덱스·뷰는 그대로 재사용한다(다형 구조가 이미 그렇게 설계됐다).
--
-- ⚠️ 적용 순서: 이 마이그레이션이 **코드보다 먼저** 적용돼도 안전하다(구 코드는 'repair' 를 쓰지 않는다).
--    반대로 코드가 먼저 나가면 정비소 리뷰 '작성'만 23514(check 위반)로 실패하고,
--    읽기·다른 장소 리뷰는 정상이다. 지도/상세 페이지가 깨지지는 않는다.
--
-- 0040 의 교훈: `drop constraint if exists` → `add constraint` 순서를 지킨다.
--   `add constraint` 는 같은 이름이 있으면 실패하므로 먼저 지워야 재적용이 멱등해진다.

alter table reviews drop constraint if exists reviews_target_type_chk;
alter table reviews add constraint reviews_target_type_chk
  check (target_type in ('gas', 'ev', 'carwash', 'repair'));
