// 포트원(PortOne) v2 결제 연동 — 서버 전용 로직 + 공개 config.
//
// 구조:
//   포트원 v2
//    ├─ 이니시스 (단건 CARD / 정기 빌링키)
//    └─ 카카오페이 (단건 EASY_PAY / 정기 빌링키)
//
// 결제 흐름:
//   단건: 클라 PortOne.requestPayment → complete/return → 서버 GET /payments/{paymentId}로
//         금액·상태 재검증 → 구독 생성(자동갱신 없음, 만료형).
//   정기: 클라 PortOne.requestIssueBillingKey → complete/return → 서버가 빌링키 확인 →
//         trial 구독 생성 → charge-cron이 POST /payments/{paymentId}/billing-key로 매월 청구.
//
// 보안:
//   - PORTONE_API_SECRET 은 서버 전용(REST 인증 헤더 `Authorization: PortOne {secret}`).
//   - 금액·상태는 클라가 보낸 값이 아니라 항상 GET /payments 로 재검증한다.
//   - 웹훅은 Standard Webhooks HMAC 서명 검증 후, 페이로드를 신뢰하지 않고 GET /payments 재조회.
//   - storeId/channelKey 는 공개값(클라 노출 OK). API Secret 은 코드/메모리 금지.

import { createHmac, timingSafeEqual } from 'crypto';

// ─── 공개 config (코드 폴백 상수 + NEXT_PUBLIC env로 덮어쓰기 가능) ───
// 클라이언트 노출이 정상인 값들. 서버 시크릿은 절대 여기 두지 않는다.

const DEFAULT_STORE_ID = 'store-767bba6f-ea67-438c-afe4-8a9df0ace9a8';

/** PG사 종류 */
export type PgKind = 'inicis' | 'kakaopay';

// {pg, recurring} → channelKey 매핑 (단건 recurring=false / 정기 recurring=true)
const DEFAULT_CHANNEL_KEYS: Record<PgKind, { onetime: string; recurring: string }> = {
  inicis: {
    onetime: 'channel-key-c2a4dc11-0200-4bea-9926-08418c0d4c12',
    recurring: 'channel-key-b58239e3-85be-43ae-ba3a-172e30891e40',
  },
  kakaopay: {
    onetime: 'channel-key-57db04a1-a002-4d9a-a55e-bf9e1c90245f',
    recurring: 'channel-key-6728e62f-ada5-4173-8d58-d41f18e9fc58',
  },
};

/** storeId (NEXT_PUBLIC env 우선, 없으면 코드 폴백) */
export function getStoreId(): string {
  return process.env.NEXT_PUBLIC_PORTONE_STORE_ID || DEFAULT_STORE_ID;
}

/**
 * {pg, recurring} → channelKey. NEXT_PUBLIC env가 있으면 우선 사용.
 *   env 키: NEXT_PUBLIC_PORTONE_CHANNEL_{PG}_{ONETIME|RECURRING}
 *   예) NEXT_PUBLIC_PORTONE_CHANNEL_INICIS_RECURRING
 */
export function getChannelKey(pg: PgKind, recurring: boolean): string {
  const slot = recurring ? 'RECURRING' : 'ONETIME';
  const envKey = `NEXT_PUBLIC_PORTONE_CHANNEL_${pg.toUpperCase()}_${slot}`;
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;
  return recurring ? DEFAULT_CHANNEL_KEYS[pg].recurring : DEFAULT_CHANNEL_KEYS[pg].onetime;
}

/** 클라이언트 결제창에 넘길 공개 config 한 번에 반환 */
export function getPublicConfig(pg: PgKind, recurring: boolean) {
  return {
    storeId: getStoreId(),
    channelKey: getChannelKey(pg, recurring),
  };
}

// ─── 서버 시크릿 ───

const PORTONE_API_BASE = 'https://api.portone.io';

function getApiSecret(): string | undefined {
  return process.env.PORTONE_API_SECRET || undefined;
}

/**
 * 포트원 REST 연동 가능 여부.
 * API Secret 미설정 시 false → subscribe/charge 등은 503 처리(Mock 회귀 없음, 결제 미진입).
 */
export function isPortoneConfigured(): boolean {
  return Boolean(getApiSecret());
}

function authHeader(): string {
  const secret = getApiSecret();
  if (!secret) throw new Error('PORTONE_API_SECRET 미설정');
  return `PortOne ${secret}`;
}

// ─── 플랜 (기존 금액·trial 그대로 유지) ───
export const PLAN = {
  /** 단건: ₩1,000 1회 결제 → 30일 이용 후 만료(자동갱신 없음) */
  onetime_1000: {
    code: 'onetime_1000' as const,
    name: '1000냥 1개월권',
    amount: 1000,
    periodDays: 30,
    recurring: false,
  },
  /** 정기: 빌링키 발급 → 7일 무료체험 후 매월(30일) 자동청구 */
  monthly_1000: {
    code: 'monthly_1000' as const,
    name: '1000냥 정기구독',
    amount: 1000,
    intervalDays: 30,
    trialDays: 7,
    recurring: true,
  },
};

export type PlanCode = keyof typeof PLAN;

// ─── 식별자 생성 (영문/숫자, 고유) ───

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** 단건 결제 paymentId */
export function makePaymentId(prefix = 'pay'): string {
  return `${prefix}-${Date.now()}-${rand()}`.slice(0, 60);
}

/** 정기 빌링키 발급 issueId */
export function makeIssueId(prefix = 'bill'): string {
  return `${prefix}-${Date.now()}-${rand()}`.slice(0, 60);
}

// ─── REST: 결제 단건 조회 (단건 결제 검증의 신뢰원) ───

export interface PortonePayment {
  /** 결제 상태: READY / PAID / VIRTUAL_ACCOUNT_ISSUED / CANCELLED / FAILED / PAY_PENDING ... */
  status: string;
  id: string;
  /** 영수증/거래번호 등 */
  pgTxId?: string;
  /** 결제 금액 정보 */
  amount?: { total?: number; paid?: number };
  orderName?: string;
  raw: Record<string, unknown>;
}

/** GET /payments/{paymentId} — 결제 건 조회. 미존재/오류 시 throw. */
export async function getPayment(paymentId: string): Promise<PortonePayment> {
  const res = await fetch(`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data?.message as string) || `HTTP ${res.status}`;
    throw new Error(`포트원 결제조회 실패: ${msg}`);
  }
  const amount = (data.amount as Record<string, unknown> | undefined) ?? undefined;
  return {
    status: String(data.status ?? ''),
    id: String(data.id ?? paymentId),
    pgTxId: data.pgTxId ? String(data.pgTxId) : undefined,
    amount: amount
      ? {
          total: amount.total != null ? Number(amount.total) : undefined,
          paid: amount.paid != null ? Number(amount.paid) : undefined,
        }
      : undefined,
    orderName: data.orderName ? String(data.orderName) : undefined,
    raw: data,
  };
}

// ─── REST: 빌링키 단건 조회 (정기 발급 검증) ───

export interface PortoneBillingKeyInfo {
  /** ISSUED / DELETED ... */
  status: string;
  billingKey: string;
  raw: Record<string, unknown>;
}

/** GET /billing-keys/{billingKey} — 빌링키 상태 조회. 미존재/오류 시 throw. */
export async function getBillingKey(billingKey: string): Promise<PortoneBillingKeyInfo> {
  const res = await fetch(`${PORTONE_API_BASE}/billing-keys/${encodeURIComponent(billingKey)}`, {
    method: 'GET',
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data?.message as string) || `HTTP ${res.status}`;
    throw new Error(`포트원 빌링키조회 실패: ${msg}`);
  }
  return {
    status: String(data.status ?? ''),
    billingKey: String(data.billingKey ?? billingKey),
    raw: data,
  };
}

// ─── REST: 빌링키 결제 (정기 청구) ───

export interface BillingKeyPayArgs {
  /** 이번 청구 건의 고유 paymentId */
  paymentId: string;
  billingKey: string;
  amount: number;
  orderName: string;
  customer?: { id?: string; email?: string; name?: string };
}

export interface BillingKeyPayResult {
  ok: boolean;
  paymentId: string;
  status?: string;
  pgTxId?: string;
  message?: string;
  raw: Record<string, unknown>;
}

/**
 * POST /payments/{paymentId}/billing-key — 빌링키로 즉시 청구.
 * 성공 시 응답 payment.status === 'PAID'.
 * 빌링키 결제는 채널이 빌링키 자체로 결정되므로 channelKey 는 선택값(미지정 시 생략).
 */
export async function payWithBillingKey(
  args: BillingKeyPayArgs,
  channelKey?: string,
): Promise<BillingKeyPayResult> {
  const body = {
    billingKey: args.billingKey,
    storeId: getStoreId(),
    ...(channelKey ? { channelKey } : {}),
    orderName: args.orderName,
    amount: { total: args.amount },
    currency: 'KRW',
    ...(args.customer ? { customer: args.customer } : {}),
  };

  const res = await fetch(
    `${PORTONE_API_BASE}/payments/${encodeURIComponent(args.paymentId)}/billing-key`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const payment = (data.payment as Record<string, unknown> | undefined) ?? data;
  const status = payment?.status ? String(payment.status) : undefined;
  return {
    ok: res.ok && status === 'PAID',
    paymentId: args.paymentId,
    status,
    pgTxId: payment?.pgTxId ? String(payment.pgTxId) : undefined,
    message: data?.message ? String(data.message) : undefined,
    raw: data,
  };
}

// ─── 웹훅 검증 (Standard Webhooks HMAC, @portone/server-sdk 미사용) ───
//   - 서명 대상: `{webhook-id}.{webhook-timestamp}.{rawBody}`
//   - 키: PORTONE_WEBHOOK_SECRET (whsec_ 접두 → 제거 후 base64 디코드해 HMAC-SHA256 키로 사용)
//   - webhook-signature: 공백 구분 `v1,{base64}` 목록 중 하나라도 일치하면 통과
//   - 시크릿 미설정 시: 서명검증 스킵({verified:false, skipped:true}). 호출부는 GET /payments 재검증만 수행.

export interface WebhookVerifyResult {
  /** 서명 검증 통과 여부 */
  verified: boolean;
  /** 시크릿 미설정으로 검증을 건너뛴 경우 true */
  skipped: boolean;
  reason?: string;
}

export function isWebhookSecretConfigured(): boolean {
  return Boolean(process.env.PORTONE_WEBHOOK_SECRET);
}

export function verifyWebhook(
  rawBody: string,
  headers: { id?: string | null; timestamp?: string | null; signature?: string | null },
): WebhookVerifyResult {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) return { verified: false, skipped: true, reason: 'no_secret' };

  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { verified: false, skipped: false, reason: 'missing_headers' };
  }

  // 타임스탬프 허용 오차(±5분) — 재전송 공격 완화
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    return { verified: false, skipped: false, reason: 'timestamp_out_of_range' };
  }

  // whsec_ 접두 제거 후 base64 디코드한 바이트를 HMAC 키로 사용
  const keyB64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(keyB64, 'base64');
  } catch {
    return { verified: false, skipped: false, reason: 'bad_secret' };
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', keyBytes).update(signedContent, 'utf8').digest('base64');
  const expectedBuf = Buffer.from(expected, 'utf8');

  // webhook-signature 는 공백 구분 목록. 각 항목은 "v1,<base64>" 형식.
  const provided = signature.split(' ');
  for (const part of provided) {
    const comma = part.indexOf(',');
    const sigB64 = comma >= 0 ? part.slice(comma + 1) : part;
    const sigBuf = Buffer.from(sigB64, 'utf8');
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return { verified: true, skipped: false };
    }
  }
  return { verified: false, skipped: false, reason: 'signature_mismatch' };
}
