-- 1000냥 주유소 - 정비소·세차장·EV 충전소에 시군구 코드 부여 (SEO 지역 랜딩용)
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 왜 필요한가: 주유소(stations)에는 sigungu_code 가 있어 /regions/{시도}/{시군구} 지역 랜딩을
-- 만들 수 있었다. 그 페이지들이 GSC 색인 문제를 실제로 해결한 전례가 있다.
-- 정비소·세차장·EV 는 공공데이터 원천에 시군구 코드가 없고 주소 텍스트만 있어, 같은 페이지를
-- 만들려면 코드를 우리가 붙여야 한다.
--
-- 값은 주소에서 계산한다(lib/regions/addressMatch.ts). 계산을 **런타임/빌드마다** 하지 않고
-- 컬럼에 저장하는 이유: 이 페이지들은 ISR(revalidate)이라 개별 페이지가 수시로 재생성되는데,
-- 그때마다 수만 행을 훑어 그룹핑하면 감당이 안 된다. 저장해 두면 인덱스 한 번으로 끝난다.
--
-- null 은 정상이다 — 주소가 없거나(EV 일부), 원천 주소에 오타가 있거나('인천 서해구'),
-- SIGUNGU 목록에 없는 지역(대전 4개구·세종 등)이면 null 로 남는다. 실측 매칭률은
-- 정비소 94.1% / EV 93.7% / 세차장 83.8% 이고, **오매칭은 0건**이다(주유소 정답 대조로 확인).
-- 매칭 실패는 그 지역 랜딩에서 빠질 뿐 지도 표시에는 아무 영향이 없다.

alter table repair_shops   add column if not exists sigungu_code text;
alter table carwash_places add column if not exists sigungu_code text;
alter table ev_chargers    add column if not exists sigungu_code text;

-- 지역 랜딩은 "이 시군구의 N곳"을 뽑는 조회라 코드 단독 인덱스면 충분하다.
create index if not exists repair_shops_sigungu_idx   on repair_shops (sigungu_code);
create index if not exists carwash_places_sigungu_idx on carwash_places (sigungu_code);
create index if not exists ev_chargers_sigungu_idx    on ev_chargers (sigungu_code);
