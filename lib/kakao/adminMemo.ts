// 관리자(앱 소유자) 본인에게 카카오톡 "나에게 보내기"(memo) 무료 알림 — 서버 전용.
//
// 토큰: 관리자 본인이 발급한 refresh_token(ADMIN_KAKAO_REFRESH_TOKEN)으로
//       access_token 을 그때그때 갱신한다(약 6시간 만료 → 5시간 메모리 캐시).
// no-op: ADMIN_KAKAO_REFRESH_TOKEN 미설정 시 조용히 skip. 어떤 실패도 throw 하지 않는다.
//        (결제 확정 등 호출부 흐름을 절대 방해하지 않기 위한 best-effort 알림.)
//
// 보안: refresh/access token, client secret 은 서버 전용. NEXT_PUBLIC 아님. 노출 금지.

const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const MEMO_URL = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';

// access_token 메모리 캐시(서버 인스턴스 단위). 만료 6h 미만으로 보수적으로 5h.
const ACCESS_TOKEN_TTL_MS = 5 * 60 * 60 * 1000;
let cachedToken: { value: string; expiresAt: number } | null = null;

function getRefreshToken(): string | undefined {
  return process.env.ADMIN_KAKAO_REFRESH_TOKEN || undefined;
}

/** 관리자 알림 사용 가능 여부(refresh token + client id 설정). */
export function isAdminMemoConfigured(): boolean {
  return Boolean(getRefreshToken() && process.env.KAKAO_CLIENT_ID);
}

/**
 * refresh_token 그랜트로 access_token 발급/갱신. 캐시가 살아있으면 재사용.
 * 실패 시 null 반환(throw 안 함).
 */
async function getAdminAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  const clientId = process.env.KAKAO_CLIENT_ID;
  if (!refreshToken || !clientId) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });
  // client_secret 은 카카오 앱 설정에서 사용 ON 일 때만 필요. 있으면 동봉.
  if (process.env.KAKAO_CLIENT_SECRET) {
    body.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: body.toString(),
    });
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      console.error('[adminMemo] access_token 갱신 실패', json.error, json.error_description);
      return null;
    }
    // 가끔 새 refresh_token 이 함께 내려온다(기존 것이 곧 만료될 때). env 보관이라 자동 저장은 불가 → 로깅만.
    if (json.refresh_token) {
      console.warn(
        '[adminMemo] 새 refresh_token 발급됨 — ADMIN_KAKAO_REFRESH_TOKEN 을 수동 갱신하세요:',
        `${json.refresh_token.slice(0, 6)}...(len ${json.refresh_token.length})`,
      );
    }
    const ttl = json.expires_in ? Math.min(json.expires_in * 1000 - 60_000, ACCESS_TOKEN_TTL_MS) : ACCESS_TOKEN_TTL_MS;
    cachedToken = { value: json.access_token, expiresAt: Date.now() + ttl };
    return json.access_token;
  } catch (e) {
    console.error('[adminMemo] access_token 갱신 네트워크 오류', e);
    return null;
  }
}

export interface AdminMemoInput {
  /** 본문 텍스트(줄바꿈 \n 허용). */
  text: string;
  /** 텍스트 클릭/버튼 이동 링크(없으면 앱 기본 URL). */
  linkUrl?: string;
}

/**
 * 관리자 본인 카톡으로 text 템플릿 메모 전송. best-effort.
 * - 미설정/토큰실패/전송실패 모두 조용히 무시(throw 안 함, 로깅만).
 */
export async function sendAdminKakaoMemo({ text, linkUrl }: AdminMemoInput): Promise<void> {
  if (!isAdminMemoConfigured()) return; // no-op

  try {
    const accessToken = await getAdminAccessToken();
    if (!accessToken) return;

    const appUrl = process.env.NEXTAUTH_URL || 'https://1000nyang.com';
    const url = linkUrl || appUrl;

    const templateObject = {
      object_type: 'text',
      text,
      link: { web_url: url, mobile_web_url: url },
      button_title: '관리자 열기',
    };

    const res = await fetch(MEMO_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[adminMemo] memo 전송 실패', res.status, detail.slice(0, 300));
      // 401 등 토큰 이슈일 수 있으니 캐시 무효화 → 다음 호출 때 재갱신.
      if (res.status === 401) cachedToken = null;
    }
  } catch (e) {
    console.error('[adminMemo] memo 전송 오류', e);
  }
}
