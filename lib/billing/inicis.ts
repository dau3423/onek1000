// KG이니시스 결제 연동 클라이언트 (서버 전용)
//
// 참고 공식 문서:
//   - PC 일반결제(INIStdPay):     https://manual.inicis.com/pay/stdpay_pc.html
//   - PC 빌링키발급:               https://manual.inicis.com/pay/bill_pc.html
//   - 빌링 결제승인 REST API:      https://manual.inicis.com/pay/bill.html
//   - 해시(데이터암호화) 규칙:     https://manual.inicis.com/pay/demo/hash.html
//
// 결제 흐름:
//   1) 클라이언트가 표준결제창(INIStdPay.js)을 호출(서명/검증값은 서버에서 생성).
//   2) 인증 완료 후 KG이니시스가 returnUrl로 결과를 POST(authToken, authUrl 등).
//   3) 서버가 authUrl로 승인요청(S2S) → 최종 승인. (returnUrl 위변조 방지의 핵심)
//   4) 단건: 승인 성공 시 1개월 만료 구독 생성.
//      정기: 빌링키발급 모드로 승인 → CARD_BillKey 저장 → charge-cron이 빌링 API로 매월 청구.
//
// 시크릿(signKey / INIAPI Key)은 서버 전용. NEXT_PUBLIC_ 노출 금지(클라이언트엔 mid만 노출).

import { createHash } from 'crypto';

// ─── 자격증명 (테스트 기본값 → 실키는 env로 교체) ───
// 공식 공개 테스트 상점 값. 실연동 시 INICIS_MID / INICIS_SIGN_KEY / INICIS_API_KEY로 덮어쓴다.
//
// ※ 중요: 일반결제(단건)와 빌링키발급은 MID가 다르다.
//   - 단건결제(INIStdPay): INIpayTest (일반결제 전용 테스트 상점)
//   - 빌링키발급(BILLAUTH): INIBillTst (빌링 전용 테스트 상점)
//   INIpayTest로 빌링키발급(BILLAUTH(Card))을 요청하면 결제창이 뜨기 전에 거부된다.
//   운영에서도 '자동결제(빌링) 계약이 된 별도 MID'가 필요하며, 일반결제 MID로는
//   빌링키 발급이 불가하다. → 빌링 전용 env(INICIS_BILL_*)로 분리한다.
const TEST_MID = 'INIpayTest';
const TEST_SIGN_KEY = 'SU5JTElURV9UUklQTEVERVNfS0VZU1RS';
const TEST_API_KEY = 'ItEQKi3rY7uvDS8l';

// 빌링 전용 공개 테스트 상점. signKey는 단건과 동일한 공개 테스트 키.
const TEST_BILL_MID = 'INIBillTst';
const TEST_BILL_SIGN_KEY = 'SU5JTElURV9UUklQTEVERVNfS0VZU1RS';
const TEST_BILL_API_KEY = 'ItEQKi3rY7uvDS8l';

/**
 * 가맹점 ID (클라이언트 결제창에도 필요한 값).
 * billing 모드는 빌링 전용 MID를 사용한다(미설정 시 INICIS_MID로,
 * 그래도 없으면 빌링 테스트 상점 INIBillTst로 폴백).
 */
export function getMid(mode: 'pay' | 'billing' = 'pay'): string {
  if (mode === 'billing') {
    return process.env.INICIS_BILL_MID || process.env.INICIS_MID || TEST_BILL_MID;
  }
  return process.env.INICIS_MID || TEST_MID;
}

/** 표준결제창 서명용 signKey (서버 전용). 모드별 MID와 매칭되는 키를 쓴다. */
function getSignKey(mode: 'pay' | 'billing' = 'pay'): string {
  if (mode === 'billing') {
    return process.env.INICIS_BILL_SIGN_KEY || process.env.INICIS_SIGN_KEY || TEST_BILL_SIGN_KEY;
  }
  return process.env.INICIS_SIGN_KEY || TEST_SIGN_KEY;
}

/** 빌링 결제승인(INIAPI)용 API Key (서버 전용). 빌링 MID와 매칭되는 키. */
function getApiKey(): string {
  return process.env.INICIS_BILL_API_KEY || process.env.INICIS_API_KEY || TEST_BILL_API_KEY;
}

/** 테스트 자격증명으로 동작 중인지 여부 (운영 가드/로깅용) */
export function isInicisTestMode(): boolean {
  return getMid('pay') === TEST_MID || getMid('billing') === TEST_BILL_MID;
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function sha512(input: string): string {
  return createHash('sha512').update(input, 'utf8').digest('hex');
}

// ─── 플랜 ───
export const PLAN = {
  /** 단건: ₩1,000 1회 결제 → 1개월 이용 후 만료(자동갱신 없음) */
  onetime_1000: {
    code: 'onetime_1000' as const,
    name: '1000냥 1개월권',
    amount: 1000,
    periodDays: 30,
    recurring: false,
  },
  /** 정기: 빌링키 발급 → 7일 무료체험 후 매월 자동청구 */
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

// ─── 표준결제창 요청 파라미터 생성 (서버 → 클라이언트로 전달) ───

export interface StdPayInitParams {
  /** 단건 결제 'pay' / 빌링키발급 'billing' */
  mode: 'pay' | 'billing';
  /** 가맹점 주문번호(고유) */
  oid: string;
  /** 결제 금액(원). 빌링키발급도 금액 필요(소액 인증) */
  price: number;
  goodname: string;
  buyername?: string;
  buyertel?: string;
  buyeremail?: string;
  returnUrl: string;
  closeUrl: string;
}

export interface StdPayFormFields {
  mid: string;
  version: '1.0';
  oid: string;
  price: string;
  timestamp: string;
  use_chkfake: 'Y';
  signature: string;
  verification: string;
  mKey: string;
  currency: 'WON';
  goodname: string;
  buyername: string;
  buyertel: string;
  buyeremail: string;
  returnUrl: string;
  closeUrl: string;
  gopaymethod: string;
  acceptmethod: string;
}

/**
 * 표준결제창에 넘길 폼 필드 생성.
 * - signature   = SHA256( "oid=...&price=...&timestamp=..." )            (signKey 미포함)
 * - verification= SHA256( "oid=...&price=...&signKey=...&timestamp=..." )(signKey 포함)
 * - mKey        = SHA256( signKey )
 *   ※ 파라미터는 키 알파벳 오름차순 NVP 문자열.
 */
export function buildStdPayFields(p: StdPayInitParams): StdPayFormFields {
  const mid = getMid(p.mode);
  const signKey = getSignKey(p.mode);
  const timestamp = String(Date.now());
  const price = String(p.price);

  const signature = sha256(`oid=${p.oid}&price=${price}&timestamp=${timestamp}`);
  const verification = sha256(`oid=${p.oid}&price=${price}&signKey=${signKey}&timestamp=${timestamp}`);
  const mKey = sha256(signKey);

  // 단건: 카드/계좌이체 + 간편결제 노출.
  // 빌링: gopaymethod는 빈값(공식 규격), acceptmethod에 BILLAUTH(Card)로
  //       신용카드 빌링키발급 지정. acceptmethod 옵션 구분자는 ':'.
  //   - BILLAUTH(Card): 신용카드 빌링키발급(빌링 핵심 옵션)
  //   - below1000: 1,000원 이하 소액 인증결제 허용(빌링 인증액이 1,000원이라 필수)
  //   ※ centerCd(Y)는 빌링키발급 흐름에서 불필요해 제거(returnUrl에서 idc_name을
  //     쓰지 않으므로 충돌 가능성만 남김).
  const gopaymethod = p.mode === 'billing' ? '' : 'Card:DirectBank:onlinepay';
  const acceptmethod =
    p.mode === 'billing'
      ? 'BILLAUTH(Card):below1000'
      : 'below1000:centerCd(Y):onlytrans:kakaopay:payco:tosspay';

  return {
    mid,
    version: '1.0',
    oid: p.oid,
    price,
    timestamp,
    use_chkfake: 'Y',
    signature,
    verification,
    mKey,
    currency: 'WON',
    goodname: p.goodname,
    buyername: p.buyername ?? '1000냥 회원',
    buyertel: p.buyertel ?? '00000000000',
    buyeremail: p.buyeremail ?? '',
    returnUrl: p.returnUrl,
    closeUrl: p.closeUrl,
    gopaymethod,
    acceptmethod,
  };
}

// ─── returnUrl 수신 결과 + 승인요청(S2S) ───

export interface StdPayReturn {
  resultCode: string;
  resultMsg?: string;
  mid: string;
  orderNumber: string;
  authToken: string;
  authUrl: string;
  netCancelUrl?: string;
  idc_name?: string;
  charset?: string;
}

export interface ApprovalResult {
  ok: boolean;
  resultCode: string;
  resultMsg?: string;
  tid?: string;
  oid?: string;
  price?: number;
  payMethod?: string;
  /** 빌링키발급 모드일 때만 존재 */
  billKey?: string;
  raw: Record<string, unknown>;
}

/**
 * 승인요청(S2S). returnUrl에서 받은 authUrl로 POST.
 * - signature    = SHA256( "authToken=...&timestamp=..." )
 * - verification = SHA256( "authToken=...&signKey=...&timestamp=..." )
 * - 응답 resultCode === '0000' 이면 승인 성공.
 *
 * authUrl은 KG이니시스가 내려준 값만 사용하되, 도메인을 검증해 SSRF를 방지한다.
 */
export async function approve(ret: StdPayReturn): Promise<ApprovalResult> {
  // 승인 서명은 결제창을 띄운 MID와 매칭되는 signKey로 만들어야 한다.
  // 빌링 MID로 시작된 거래면 빌링 signKey를 쓴다(ret.mid로 판별).
  const mode: 'pay' | 'billing' = ret.mid === getMid('billing') ? 'billing' : 'pay';
  const signKey = getSignKey(mode);
  const timestamp = String(Date.now());
  const signature = sha256(`authToken=${ret.authToken}&timestamp=${timestamp}`);
  const verification = sha256(`authToken=${ret.authToken}&signKey=${signKey}&timestamp=${timestamp}`);

  // authUrl 출처 검증: inicis.com 도메인만 허용
  const url = new URL(ret.authUrl);
  if (!/(^|\.)inicis\.com$/i.test(url.hostname) || url.protocol !== 'https:') {
    throw new Error(`승인 URL 도메인이 올바르지 않습니다: ${url.hostname}`);
  }

  const body = new URLSearchParams({
    mid: ret.mid,
    authToken: ret.authToken,
    signature,
    verification,
    timestamp,
    charset: 'UTF-8',
    format: 'JSON',
  });

  const res = await fetch(ret.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  const resultCode = String(data.resultCode ?? '');
  return {
    ok: resultCode === '0000',
    resultCode,
    resultMsg: data.resultMsg ? String(data.resultMsg) : undefined,
    tid: data.tid ? String(data.tid) : undefined,
    oid: data.MOID ? String(data.MOID) : undefined,
    price: data.TotPrice != null ? Number(data.TotPrice) : undefined,
    payMethod: data.payMethod ? String(data.payMethod) : undefined,
    billKey: data.CARD_BillKey ? String(data.CARD_BillKey) : undefined,
    raw: data,
  };
}

// ─── 빌링 결제승인 REST API (발급된 billKey로 청구) ───
// V1 NVP: https://iniapi.inicis.com/api/v1/billing
//   hashData = SHA512( INIAPIKey + type + paymethod + timestamp + clientIp + mid + moid + price + billKey )

const BILLING_API_URL = 'https://iniapi.inicis.com/api/v1/billing';

export interface BillingChargeArgs {
  billKey: string;
  oid: string;          // moid
  price: number;
  goodName: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerTel?: string;
  clientIp: string;     // 가맹점 서버 IP
  url: string;          // 가맹점 도메인
}

export interface BillingChargeResult {
  ok: boolean;
  resultCode: string;
  resultMsg?: string;
  tid?: string;
  raw: Record<string, unknown>;
}

/** 빌링키로 정기결제 청구. 성공 시 resultCode === '00'. */
export async function chargeBilling(args: BillingChargeArgs): Promise<BillingChargeResult> {
  // 빌링 청구는 빌링키를 발급한 빌링 MID/INIAPI Key로 수행한다.
  const mid = getMid('billing');
  const apiKey = getApiKey();
  const type = 'Billing';
  const paymethod = 'Card';
  const timestamp = formatTimestamp14(new Date());
  const price = String(args.price);

  const hashData = sha512(
    apiKey + type + paymethod + timestamp + args.clientIp + mid + args.oid + price + args.billKey,
  );

  const body = new URLSearchParams({
    type,
    paymethod,
    timestamp,
    clientIp: args.clientIp,
    mid,
    url: args.url,
    moid: args.oid,
    goodName: args.goodName,
    buyerName: args.buyerName ?? '1000냥 회원',
    buyerEmail: args.buyerEmail ?? '',
    buyerTel: args.buyerTel ?? '',
    price,
    billKey: args.billKey,
    authentification: '00',
    cardQuota: '00',
    currency: 'WON',
    hashData,
  });

  const res = await fetch(BILLING_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const resultCode = String(data.resultCode ?? '');
  return {
    ok: resultCode === '00',
    resultCode,
    resultMsg: data.resultMsg ? String(data.resultMsg) : undefined,
    tid: data.tid ? String(data.tid) : undefined,
    raw: data,
  };
}

/** YYYYMMDDhhmmss */
function formatTimestamp14(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

/** 가맹점 주문번호 생성 (영문/숫자, 40자 이내) */
export function makeOid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now()}${rand}`.slice(0, 40);
}
