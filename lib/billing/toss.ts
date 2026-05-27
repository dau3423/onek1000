// 토스페이먼츠 자동결제(빌링키) 클라이언트
// https://docs.tosspayments.com/reference/using-api/api-keys
// MVP/알파에서는 TEST 시크릿 키 사용 가능.

const TOSS_BASE = 'https://api.tosspayments.com/v1';

function basicAuth() {
  const secret = process.env.TOSS_PAYMENTS_SECRET_KEY;
  if (!secret) throw new Error('TOSS_PAYMENTS_SECRET_KEY missing');
  return 'Basic ' + Buffer.from(`${secret}:`).toString('base64');
}

interface IssueBillingKeyArgs {
  /** 클라이언트에서 인증창을 통과한 후 받은 authKey */
  authKey: string;
  /** 가맹점이 생성한 사용자 식별자 (uuid 권장) */
  customerKey: string;
}

interface BillingKeyResponse {
  billingKey: string;
  customerKey: string;
  authenticatedAt: string;
  method: string;
  card?: { issuerCode?: string; acquirerCode?: string; number?: string; cardType?: string };
}

/** authKey + customerKey → 영구 billingKey 발급 */
export async function issueBillingKey({ authKey, customerKey }: IssueBillingKeyArgs): Promise<BillingKeyResponse> {
  const res = await fetch(`${TOSS_BASE}/billing/authorizations/issue`, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ authKey, customerKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Toss issue billingKey failed: ${res.status} ${err.code ?? ''} ${err.message ?? ''}`);
  }
  return res.json();
}

interface ChargeArgs {
  billingKey: string;
  customerKey: string;
  amount: number;          // 원
  orderId: string;         // 가맹점이 생성, 64자 이내 unique
  orderName: string;
  customerEmail?: string;
  customerName?: string;
}

interface ChargeResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  approvedAt: string;
  totalAmount: number;
  method: string;
}

/** 빌링키로 결제 실행 */
export async function chargeWithBillingKey(args: ChargeArgs): Promise<ChargeResponse> {
  const { billingKey, ...body } = args;
  const res = await fetch(`${TOSS_BASE}/billing/${billingKey}`, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Toss charge failed: ${res.status} ${err.code ?? ''} ${err.message ?? ''}`);
  }
  return res.json();
}

/** 빌링키 삭제 (해지) */
export async function deleteBillingKey(billingKey: string): Promise<void> {
  const res = await fetch(`${TOSS_BASE}/billing/authorizations/${billingKey}`, {
    method: 'DELETE',
    headers: { Authorization: basicAuth() },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Toss delete billingKey failed: ${res.status}`);
  }
}

export const PLAN = {
  monthly_1000: {
    code: 'monthly_1000' as const,
    name: '1000냥 월간',
    amount: 1000,
    intervalDays: 30,
    trialDays: 7,
  },
};
