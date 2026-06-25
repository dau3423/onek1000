// X(트위터) 자동발행 클라이언트 — OAuth 1.0a (user context)로 POST /2/tweets 호출.
// 외부 의존 추가 없이 node:crypto 의 HMAC-SHA1 로 서명을 직접 구현한다.
//
// env: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// 미설정 시 발행을 skip(로그 후 null/[] 반환).
//
// [서명 주의] v2 JSON 본문 엔드포인트는 OAuth1.0a base string에 **oauth_* 파라미터만**
// 포함한다(JSON 본문은 서명 대상이 아님). 폼/쿼리 파라미터가 없으므로 정렬·인코딩 대상은
// oauth_* 7개뿐이다.

import crypto from 'crypto';

const TWEETS_URL = 'https://api.twitter.com/2/tweets';

interface XCreds {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

function readCreds(): XCreds | null {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

/** 4개 X env 가 모두 설정됐는지 */
export function isXConfigured(): boolean {
  return readCreds() !== null;
}

/** RFC3986 percent-encode — OAuth1.0a 규격(! * ' ( ) 까지 인코딩). */
function rfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * OAuth1.0a Authorization 헤더를 만든다.
 * base string = POST&{encode(url)}&{encode(정렬된 oauth 파라미터)}
 * signing key  = {encode(consumerSecret)}&{encode(tokenSecret)}
 * HMAC-SHA1 → base64 → oauth_signature
 * (JSON 본문 파라미터는 서명에서 제외 — oauth_* 만 포함)
 */
function buildAuthHeader(method: string, url: string, creds: XCreds): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  // 파라미터 정렬(키 기준) → key=value 를 각각 인코딩 후 &로 결합
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(oauth[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    rfc3986(url),
    rfc3986(paramString),
  ].join('&');

  const signingKey = `${rfc3986(creds.apiSecret)}&${rfc3986(creds.accessSecret)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  const headerParams: Record<string, string> = { ...oauth, oauth_signature: signature };
  const header =
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(headerParams[k])}"`)
      .join(', ');
  return header;
}

/**
 * 트윗 1건 발행. replyToId 가 있으면 그 트윗에 대한 답글로 스레드를 잇는다.
 * env 누락이면 null(skip, 로그). HTTP 실패면 에러 throw(호출부에서 catch).
 */
export async function postTweet(text: string, replyToId?: string): Promise<{ id: string } | null> {
  const creds = readCreds();
  if (!creds) {
    console.warn('[xClient] X env not configured — skip postTweet');
    return null;
  }

  const body: Record<string, unknown> = { text };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

  const authHeader = buildAuthHeader('POST', TWEETS_URL, creds);
  const res = await fetch(TWEETS_URL, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`X postTweet ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const id = json?.data?.id;
  if (!id) throw new Error(`X postTweet: no id in response`);
  return { id };
}

/**
 * 스레드 발행 결과. ids = 지금까지 성공 발행된 트윗 id(부분 성공 포함).
 * error 가 있으면 중간 실패한 것이며, ids 에 그 직전까지 성공분이 보존된다.
 */
export interface ThreadResult {
  ids: string[];
  error?: string;
}

/**
 * 스레드 발행 — 첫 트윗 후 그 id에 순차 reply 로 잇는다.
 * env 누락이면 { ids: [] } 반환(skip).
 * 중간 실패 시 throw 하지 않고 { ids, error } 로 부분 발행 id 를 보존해 반환한다.
 */
export async function postThread(tweets: string[]): Promise<ThreadResult> {
  if (!isXConfigured()) {
    console.warn('[xClient] X env not configured — skip postThread');
    return { ids: [] };
  }
  const ids: string[] = [];
  let replyTo: string | undefined;
  for (const text of tweets) {
    if (!text || !text.trim()) continue;
    try {
      const r = await postTweet(text, replyTo);
      if (!r) break; // env 누락(이론상 위에서 거름)
      ids.push(r.id);
      replyTo = r.id;
    } catch (e) {
      // 중간 실패: 지금까지 성공한 ids 를 보존해 반환(throw 하지 않음).
      return { ids, error: (e as Error).message };
    }
  }
  return { ids };
}
