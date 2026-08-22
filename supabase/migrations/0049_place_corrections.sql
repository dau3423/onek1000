-- 1000냥 주유소 - 사용자 제보(정정 요청) 통합 테이블
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 두 가지 제보를 한 테이블로 받는다. 화면·검수 흐름이 같고(제보 → 관리자 승인 → 반영),
-- 종류마다 테이블을 나누면 관리자 콘솔을 두 벌 만들게 된다.
--   kind='repair_brand' : 정비소 브랜드가 다르다는 제보. payload = {"brand":"gongim"}
--   kind='fuel_price'   : 주유소 유가가 다르다는 제보.   payload = {"product":"B027","price":1750}
--
-- ── 왜 이게 필요한가 ────────────────────────────────────────────────────────
-- 정비소: 공공데이터에는 사업자등록 상호만 있고 실제 간판이 없다. '효원카'가 실은 공임나라
--   가맹점인 경우를 이름만 보고는 절대 못 잡는다. 카카오·네이버 지도는 간판명을 갖고 있지만
--   두 곳 모두 약관이 '저장 목적 이용'을 금지한다(네이버는 '지역정보를 별도 DB로 관리'를
--   금지 예시로 조문에 명시). 소상공인 상가정보도 같은 상호 한계라 실익이 없었다(실측 확인).
--   → 남은 합법적 경로는 사용자 제보뿐이고, 제보로 받은 값은 **우리 데이터**라 자유롭게 쓸 수 있다.
--
-- 유가: 오피넷은 하루 단위 갱신이라 현장 가격과 어긋날 때가 있다.
--
-- ── 안전 원칙 ──────────────────────────────────────────────────────────────
-- 1) 승인 전에는 **어디에도 노출되지 않는다**. 허위 제보가 바로 화면에 뜨면 사용자가 헛걸음한다.
-- 2) 유가 제보는 공식 가격을 **대체하지 않는다**. 오피넷 trade_dt 보다 제보가 최신일 때만
--    보조 정보로 함께 보여주고, 오피넷이 더 새 값을 받으면 자동으로 밀려난다(아래 뷰).
-- 3) 로그인 필수 — 누가 제보했는지 남아야 반복 허위 제보를 막는다.
-- 4) 사진은 선택. 관리자가 승인 판단할 근거(간판 사진, 가격판 사진)로만 쓴다.

create table if not exists place_corrections (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('repair_brand', 'fuel_price')),
  -- 대상: repair_brand 는 ('repair', shop_key), fuel_price 는 ('gas', station_id).
  -- reviews 와 같은 다형 표기를 쓴다(관리자 콘솔에서 같은 방식으로 읽는다).
  target_type  text not null check (target_type in ('gas', 'repair')),
  target_id    text not null,
  user_id      uuid not null references users(id) on delete cascade,
  payload      jsonb not null,
  -- 검증용 첨부 사진(선택). reviews.photo_paths 와 같은 규약: 'review-photos' 버킷의 객체 경로.
  -- 버킷이 비공개라 표시할 때 서명 URL 을 발급한다(lib/storage/photos.ts).
  photo_paths  text[] not null default '{}',
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- 제보 시점. 유가 제보는 이 값을 오피넷 trade_dt 와 비교해 신선도를 판정한다.
  reported_at  timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  text,                        -- 처리한 관리자 이메일
  admin_note   text check (char_length(admin_note) <= 300)
);

-- 사진이 붙은 뒤에 이 파일을 적용하는 일은 없지만, 이미 이전 초안을 적용했을 가능성에 대비한다
-- (0040 의 교훈: create table if not exists 는 이름만 보고 컬럼 변경을 무시한다).
alter table place_corrections add column if not exists photo_paths text[] not null default '{}';

-- 관리자 대기열(미처리 우선).
create index if not exists place_corrections_pending_idx
  on place_corrections (reported_at desc) where status = 'pending';

-- 대상별 조회(승인된 것만 읽는 경로).
create index if not exists place_corrections_target_idx
  on place_corrections (target_type, target_id, status);

-- 한 사용자가 같은 대상에 **처리 대기 중인** 제보를 여러 건 쌓지 못하게 한다.
-- 처리(승인/반려)된 뒤에는 다시 제보할 수 있어야 하므로 pending 만 제약한다.
--
-- 유종(payload->>'product')까지 키에 넣는 이유: 한 주유소에서 휘발유와 경유가 동시에 다를 수
-- 있는데, 유종을 빼면 첫 제보 하나만 받고 두 번째가 중복으로 거절된다.
-- 정비소 브랜드 제보에는 product 가 없어 coalesce 로 ''가 되고, 대상당 1건 제약이 그대로 유지된다.
create unique index if not exists place_corrections_user_target_pending
  on place_corrections (user_id, kind, target_type, target_id, coalesce(payload->>'product', ''))
  where status = 'pending';

alter table place_corrections disable row level security;  -- 서버(service_role) 전용

-- ── 정비소 브랜드 보정 ──────────────────────────────────────────────────────
-- 승인된 최신 브랜드 제보 1건을 대상별로 뽑는다.
-- ⚠️ 이 값을 repair_shops.brand 에 **직접 쓰지 않는다**. sync-repair 가 반기마다 업체명에서
--    brand 를 다시 계산하며 덮어쓰기 때문이다. 조회 시점에 coalesce 로 덮어써야 sync 와
--    무관하게 살아남는다.
--
-- payload->>'brand' 가 null 인 제보('브랜드 없음'으로 정정)는 여기서 걸러낸다.
-- coalesce 로 합칠 것이므로 null 을 남기면 "보정 없음"과 구분되지 않아 원본 브랜드가 되살아난다.
-- 무소속 정정은 아래 별도의 sentinel('none')로 표현한다.
create or replace view repair_brand_override as
select distinct on (target_id)
  target_id                                as shop_key,
  coalesce(payload->>'brand', 'none')      as brand   -- 'none' = 브랜드 없음으로 정정
from place_corrections
where kind = 'repair_brand' and status = 'approved'
order by target_id, resolved_at desc nulls last, reported_at desc;

-- ── 유가 제보 ──────────────────────────────────────────────────────────────
-- 승인됐고 **오피넷 기준일보다 최신인** 제보만 남긴다.
-- 오피넷이 더 새 가격을 받으면 이 뷰에서 자동으로 사라진다 — 낡은 제보가 계속 남지 않는다.
create or replace view fuel_price_report_active as
select distinct on (c.target_id, c.payload->>'product')
  c.target_id                          as station_id,
  c.payload->>'product'                as product,
  (c.payload->>'price')::int           as reported_price,
  c.reported_at,
  p.price                              as official_price,
  p.trade_dt                           as official_trade_dt
from place_corrections c
join prices_latest p
  on p.station_id = c.target_id
 and p.product = c.payload->>'product'
where c.kind = 'fuel_price'
  and c.status = 'approved'
  -- 제보가 오피넷 기준일보다 최신일 때만 유효.
  -- trade_dt 는 날짜이므로 "그 날 이후"의 경계는 익일 0시다. 오피넷 sync 는 KST 기준으로 도는데
  -- timestamptz 비교는 UTC 로 하므로 시간대를 명시한다(안 쓰면 서버 TZ 에 따라 9시간 어긋난다).
  and c.reported_at >= ((p.trade_dt + 1)::timestamp at time zone 'Asia/Seoul')
order by c.target_id, c.payload->>'product', c.reported_at desc;

-- ── bbox RPC 재정의 — 승인된 브랜드 보정을 반영 ─────────────────────────────
-- 0047 정의에 repair_brand_override 조인만 추가한다. 정렬·면적 캐스팅 가드는 그대로 둔다.
--
-- 핵심: 필터(p_brand)도 **보정된 브랜드**를 기준으로 걸어야 한다. 원본 brand 로 필터하면
-- "공임나라로 정정 승인된 효원카"가 공임나라 필터에서 여전히 빠진다 — 제보를 받은 의미가 없다.
-- 반환하는 brand 컬럼도 보정값이라 지도 마커·라벨이 그대로 따라온다.
--
-- 반환 타입이 바뀌지 않아도 인자 목록이 같으면 replace 가 되지만, 이 저장소 규칙대로
-- 먼저 drop 하고 새로 만든다(0046→0047 에서 겪은 반환 타입 변경 실패 회피).
drop function if exists rpc_repair_by_bbox(float8, float8, float8, float8, int);
drop function if exists rpc_repair_by_bbox(float8, float8, float8, float8, int, text);

create function rpc_repair_by_bbox(
  p_sw_lng float8, p_sw_lat float8,
  p_ne_lng float8, p_ne_lat float8,
  p_limit  int,
  p_brand  text default null
)
returns table (
  shop_key text, name text, shop_type text, brand text,
  road_addr text, jibun_addr text, tel text,
  open_time text, close_time text,
  lat float8, lng float8,
  data_base_date date, synced_at timestamptz
) language sql stable as $$
  with eff as (
    select
      r.*,
      -- 보정이 있으면 그것이 이긴다. 'none' 은 "브랜드 없음으로 정정"이라 null 로 되돌린다.
      case
        when o.brand is null   then r.brand
        when o.brand = 'none'  then null
        else o.brand
      end as eff_brand
    from repair_shops r
    left join repair_brand_override o on o.shop_key = r.shop_key
    where r.geom && st_makeenvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
  )
  select
    e.shop_key, e.name, e.shop_type, e.eff_brand as brand,
    e.road_addr, e.jibun_addr, e.tel,
    e.open_time, e.close_time,
    e.lat, e.lng,
    e.data_base_date, e.synced_at
  from eff e
  where (
      p_brand is null
      or (p_brand = 'none' and e.eff_brand is null)
      or e.eff_brand = p_brand
    )
  order by
    (e.eff_brand is null),                   -- false(=브랜드 있음)가 먼저
    case e.shop_type
      when 'general'   then 1
      when 'small'     then 2
      when 'specialty' then 3
      when 'engine'    then 4
      else 5
    end,
    case
      when regexp_replace(coalesce(e.area, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
      then regexp_replace(coalesce(e.area, ''), '[^0-9.]', '', 'g')::numeric
      else 0
    end desc,
    e.shop_key
  limit p_limit;
$$;
