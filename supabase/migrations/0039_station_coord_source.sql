-- 1000냥 주유소 - 주유소 좌표 출처/원본 보존 컬럼 (FR-3)
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 배경: stations 의 좌표(lat/lng/geom)는 sync-opinet 이 매일 오피넷 KATEC 변환값으로 upsert 한다.
--       바탕지도가 카카오맵이라 오피넷 변환 좌표가 계통적으로 어긋나 마커가 옆 건물/길 건너에 찍힌다.
--       backfill-geocode 라우트가 주소를 카카오로 지오코딩해 1.5km 가드 통과분만 좌표를 교체한다.
--
-- 이 마이그레이션이 추가하는 것:
--   - coord_source : 현재 좌표의 출처('kakao' = backfill-geocode 채택 좌표 / 'opinet' = 오피넷 변환 좌표).
--                    backfill-geocode 가 채택 시 'kakao' 로 표시한다. sync-opinet 은 이 값이 'kakao' 인
--                    기존 행의 lat/lng/geom 을 덮어쓰지 않는다(카카오 채택 좌표 보존).
--   - opinet_lat / opinet_lng : 카카오 좌표로 덮기 전의 원본 오피넷 좌표(WGS84)를 1회 보존한다.
--                    이미 채워져 있으면 보존(재실행 시 원본 유실 방지). 롤백/검증용.
--
-- 모두 nullable·기본 미설정이라 idempotent 하며, 미적용(컬럼 부재) 상태에서도 앱 전 기능과
-- sync-opinet·backfill-geocode 라우트가 정상 동작한다(컬럼 존재를 라우트가 감지해 graceful degrade).

alter table stations add column if not exists coord_source text;         -- 'kakao' | 'opinet' | null(미분류)
alter table stations add column if not exists opinet_lat double precision; -- 카카오 채택 전 원본 오피넷 위도(WGS84)
alter table stations add column if not exists opinet_lng double precision; -- 카카오 채택 전 원본 오피넷 경도(WGS84)

comment on column stations.coord_source is '현재 lat/lng/geom 의 출처. kakao=backfill-geocode 채택(정본), opinet=오피넷 변환. sync-opinet 은 kakao 행 좌표를 보존한다.';
comment on column stations.opinet_lat is '카카오 좌표 채택 전 원본 오피넷 위도(WGS84). 이미 있으면 보존.';
comment on column stations.opinet_lng is '카카오 좌표 채택 전 원본 오피넷 경도(WGS84). 이미 있으면 보존.';
