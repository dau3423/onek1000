-- 결제를 KG이니시스 직연동 → 포트원(PortOne) v2 로 마이그레이션.
-- ★ 스키마 변경 없음(컬럼 추가/삭제 없음). 기존 컬럼의 "의미"만 포트원에 맞게 재사용한다.
--   이 파일은 주석(comment) 갱신만 수행하므로 적용은 선택사항이며, 데이터에 영향 없다.
--
-- 컬럼 의미 재정의:
--   subscriptions.provider      : 'portone' (구 'inicis'/'toss' — 신규 행은 'portone')
--   subscriptions.inicis_tid    : 포트원 결제 식별자(paymentId) 또는 PG 거래번호(txId/pgTxId)
--   subscriptions.billing_key   : 포트원 빌링키(정기결제에서만 사용)
--   subscriptions.customer_key  : 결제 시작 시 발급한 paymentId(단건)/issueId(정기)
--   billing_pending.oid         : paymentId(단건) 또는 issueId(정기) — 결제 신뢰원
--   billing_pending.mode        : 'pay'(단건) / 'billing'(정기 빌링키 발급)
--   billing_events.tid          : 포트원 paymentId/txId
--   billing_events.oid          : 포트원 paymentId/issueId
--   billing_events.provider     : 'portone'

comment on column subscriptions.inicis_tid is
  '포트원 결제 식별자(paymentId) 또는 PG 거래번호(txId). 컬럼명은 레거시(이니시스) 유지';
comment on column subscriptions.billing_key is
  '포트원 빌링키. 정기결제(빌링키 발급)에서만 사용';
comment on column subscriptions.customer_key is
  '결제 시작 시 발급한 paymentId(단건)/issueId(정기). billing_pending.oid 와 매칭';
comment on column subscriptions.provider is
  '결제대행. 신규는 ''portone''(구 ''inicis''/''toss'')';

comment on column billing_pending.oid is
  '포트원 paymentId(단건)/issueId(정기). 결제 식별 신뢰원';
comment on column billing_pending.mode is
  '''pay''(단건 결제) / ''billing''(정기 빌링키 발급)';
