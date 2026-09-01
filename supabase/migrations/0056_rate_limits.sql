-- 1000냥 주유소 — IP 레이트리밋 카운터 (DB 백엔드)
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 금지 — 적용법은 보고 참조)
--
-- 배경: 공개 엔드포인트 3종(/api/event, /api/visit, /api/carwash-index)의 IP 레이트리밋이
--       Upstash Redis 의 incrWithTtl 에 의존했는데, 프로덕션에 Upstash 가 설정된 적이 없어
--       incrWithTtl 이 항상 0 을 반환했고 호출부가 이를 '통과'로 해석해 **제한이 전혀 걸리지
--       않았다.** /api/event 는 이벤트 이름만 화이트리스트로 검사하고 props 는 무검증으로
--       insert 하므로, 무제한 쓰기가 퍼널 지표를 오염시키고 DB 비용·가용성을 위협한다.
--       미들웨어는 /api 를 제외하고, Cloud Armor 설정도 인증도 크기 제한도 없다.
--
-- Upstash 를 도입하지 않고 DB 로 처리한다 — 새 벤더 없이, 이미 쓰는 Supabase 로 충분하다.
-- (읽기 캐시는 여기 포함하지 않는다. 뜨거운 읽기 경로는 DB 가 Redis 보다 불리하고,
--  CDN s-maxage 가 상당 부분 흡수하고 있어 서두를 근거가 약하다.)

create table if not exists rate_limits (
  -- '용도:식별자:윈도우' 형태의 버킷 키. 예) 'event:1.2.3.4'
  bucket     text primary key,
  count      int not null default 0,
  expires_at timestamptz not null
);

-- 만료 행 정리용(핫 경로가 아니라 청소 경로).
create index if not exists rate_limits_expires_idx on rate_limits (expires_at);

-- ─── 카운터 증가 ───
-- 반환: 이번 요청을 포함한 현재 윈도우의 누적 횟수.
--
-- 원자성: insert .. on conflict do update 는 한 문장이라 동시 요청에서도 카운트가 유실되지 않는다
--        (읽고-쓰기로 나누면 두 요청이 같은 값을 읽어 하나가 사라진다).
-- 윈도우: 만료된 버킷을 만나면 1 로 리셋하고 만료시각을 새로 잡는다(고정 윈도우).
create or replace function rpc_rate_limit_hit(p_bucket text, p_window_sec int)
returns int
language plpgsql
as $$
declare n int;
begin
  insert into rate_limits (bucket, count, expires_at)
  values (p_bucket, 1, now() + make_interval(secs => p_window_sec))
  on conflict (bucket) do update
    set count = case when rate_limits.expires_at <= now() then 1
                     else rate_limits.count + 1 end,
        expires_at = case when rate_limits.expires_at <= now()
                          then now() + make_interval(secs => p_window_sec)
                          else rate_limits.expires_at end
  returning count into n;

  -- 만료 행 청소 — 매번 돌리면 핫 경로에 부담이라 약 1% 확률로만 수행한다.
  -- 버킷은 IP 단위라 방치하면 계속 쌓인다.
  if random() < 0.01 then
    delete from rate_limits where expires_at < now() - interval '1 hour';
  end if;

  return n;
end $$;
