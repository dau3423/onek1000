-- 1000냥 주유소 - 범용 sync 진행 커서 테이블
-- Supabase SQL Editor 또는 supabase db push 로 적용. (운영 DB에 직접 적용 절차는 보고 참조)
--
-- 배경: 전국 주유소 "위치"를 Opinet aroundAll(반경 내 전체 주유소)로 격자 순회하며
--       매일 조금씩(콜 상한 내) 증분 적재한다. 일일 한도(1,500) 안에서 며칠~몇 주에
--       걸쳐 전국을 한 바퀴 돌아야 하므로, "마지막으로 처리한 격자 셀 인덱스"를
--       영속화해 다음 실행이 그 다음 셀부터 이어가게 한다.
--
-- 설계: key 단위로 idx(마지막 처리 인덱스)를 보관하는 작은 KV 테이블.
--       Redis 미설정 환경에서도 안전하게 동작하도록 DB 에 둔다.
--       'backfill_stations' 키를 전국 위치 백필 진행 커서로 사용한다.
--
-- 폴백: 이 테이블이 없으면 backfill-stations 라우트는 idx=0(처음)부터 시작하고
--       커서 저장을 best-effort 로 무시한다(적재 자체는 동작, 다만 매번 처음부터).

create table if not exists sync_cursor (
  key        text primary key,                 -- 커서 식별자(예: 'backfill_stations')
  idx        int  not null default 0,          -- 마지막으로 처리 완료한 항목(셀) 인덱스
  updated_at timestamptz not null default now()
);
