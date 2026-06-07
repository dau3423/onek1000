// 인앱 브라우저(카톡/인스타 등 SNS 웹뷰) 감지 + 외부 브라우저 열기 유도 유틸.
//
// 배경(문제): SNS(카카오톡 채팅 등) 링크로 들어오면 그 앱의 인앱 웹뷰로 열린다.
// 이 웹뷰에서는 구글 OAuth가 `disallowed_useragent`로 차단되고 카카오 로그인도 깨져서
// "가입 자체가 안 되는" 전환 손실이 발생한다. 그래서 인앱 웹뷰를 감지해
// Chrome/Safari 같은 "외부 브라우저로 열기"를 유도한다.
//
// 설계 원칙:
//  - 클라이언트 전용. 모든 함수는 SSR 안전(typeof navigator/window 가드)하게 동작한다.
//  - 오탐 방지: 일반 모바일 Safari/Chrome 사용자에게 배너가 뜨지 않도록,
//    "명시적 인앱앱 토큰"(KAKAOTALK, Instagram, FBAN 등) 위주로 보수적으로 감지한다.
//    안드로이드 일반 웹뷰 신호(`; wv`)는 단독으로는 신뢰하지 않는다(아래 주석 참고).
//  - 외부 열기는 플랫폼별 best-effort. 실패해도 깨지지 않게 try/catch로 감싸고,
//    항상 "링크 복사" 폴백을 제공한다.

/** 감지된 인앱 웹뷰 종류. 'unknown'은 인앱이지만 특정 앱을 식별 못 한 경우(주로 일반 안드 웹뷰). */
export type InAppKind =
  | 'kakaotalk'
  | 'instagram'
  | 'facebook'
  | 'line'
  | 'naver'
  | 'band'
  | 'daum'
  | 'twitter'
  | 'unknown';

/** 플랫폼(외부 열기 전략 분기에 사용). */
export type Platform = 'android' | 'ios' | 'other';

function getUserAgent(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

/** UA 기반 플랫폼 판별. */
export function getPlatform(ua: string = getUserAgent()): Platform {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
}

// 명시적 인앱앱 토큰 → 종류 매핑(보수적). 위에서부터 우선 매칭한다.
// 각 토큰은 해당 앱의 웹뷰 UA에 명확히 박히는 식별자만 사용한다.
const KIND_TOKENS: { kind: InAppKind; re: RegExp }[] = [
  { kind: 'kakaotalk', re: /KAKAOTALK/i },
  { kind: 'instagram', re: /Instagram/i },
  // 페이스북 계열: FBAN/FBAV(앱 빌드 식별), FB_IAB(인앱 브라우저)
  { kind: 'facebook', re: /FBAN|FBAV|FB_IAB/i },
  { kind: 'line', re: /\bLine\//i },
  { kind: 'naver', re: /NAVER\(inapp|NAVER /i },
  { kind: 'band', re: /\bBAND\b/i },
  { kind: 'daum', re: /DaumApps/i },
  { kind: 'twitter', re: /Twitter|TwitterAndroid|\bX11.*X\/|\bXapp/i },
];

/**
 * 인앱 웹뷰 종류를 반환한다. 인앱이 아니면 null.
 *
 * 일반 안드로이드 웹뷰 신호(`; wv`)는 단독으로 인앱 단정하지 않는다.
 * 이유: 일부 정상 브라우저/크롬 커스텀탭에서도 wv 흔적이 남아 오탐 위험이 있기 때문.
 * 대신 "버전 토큰(Version/x.x) 없이 wv 가 있는" 전형적 안드 웹뷰 패턴만 'unknown' 인앱으로 본다.
 */
export function getInAppKind(ua: string = getUserAgent()): InAppKind | null {
  if (!ua) return null;

  for (const { kind, re } of KIND_TOKENS) {
    if (re.test(ua)) return kind;
  }

  // 안드로이드 일반 웹뷰(보수적): '; wv'가 명시되어 있고, 정식 크롬 식별자(Version/...) 패턴이
  // 아닌 경우에만 인앱(unknown)으로 본다. 일반 모바일 크롬은 'Chrome/xxx Mobile Safari'이며
  // '; wv'가 없으므로 여기 걸리지 않는다.
  if (getPlatform(ua) === 'android' && /;\s*wv\b/i.test(ua)) {
    return 'unknown';
  }

  return null;
}

/** 인앱 웹뷰 여부. SSR 안전. */
export function isInAppBrowser(ua: string = getUserAgent()): boolean {
  return getInAppKind(ua) !== null;
}

/** 종류별 한국어 표시명(안내 문구용). */
export function inAppKindLabel(kind: InAppKind): string {
  switch (kind) {
    case 'kakaotalk':
      return '카카오톡';
    case 'instagram':
      return '인스타그램';
    case 'facebook':
      return '페이스북';
    case 'line':
      return '라인';
    case 'naver':
      return '네이버 앱';
    case 'band':
      return '밴드';
    case 'daum':
      return '다음 앱';
    case 'twitter':
      return 'X(트위터)';
    default:
      return '인앱';
  }
}

/** 현재 페이지 전체 URL(callbackUrl 등 쿼리 포함). SSR 안전. */
export function currentUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href;
}

/** `intent://` URL 구성용으로 https:// 를 제거한 host+path+query 를 만든다. */
function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, '');
}

export interface OpenExternalResult {
  /** 외부 열기 스킴/인텐트 실행을 실제로 시도했는지. false면 호출측이 '복사 안내'로 폴백해야 함. */
  attempted: boolean;
  /** iOS 등 프로그램적 강제 열기가 불가해 수동 안내가 필요한지. */
  needsManual: boolean;
}

/**
 * 감지된 웹뷰/플랫폼에 맞춰 외부 브라우저 열기를 best-effort로 시도한다.
 *
 *  - 카카오톡 웹뷰: `kakaotalk://web/openExternal?url=...`(카톡 지원 스킴)으로 외부 강제 열기.
 *  - 안드로이드 일반/그 외 웹뷰: `intent://...#Intent;scheme=https;...;end`로 외부(크롬) 열기 시도.
 *  - iOS(인스타 등): 프로그램적 강제 열기가 막혀 있어 attempted=false, needsManual=true 반환
 *    → 호출측에서 "Safari로 열기" 안내 + 링크 복사 폴백을 보여준다.
 *
 * 어떤 경로든 예외가 나도 throw 하지 않는다(항상 결과 객체 반환).
 */
export function openExternalBrowser(url: string = currentUrl()): OpenExternalResult {
  if (typeof window === 'undefined' || !url) {
    return { attempted: false, needsManual: true };
  }

  const kind = getInAppKind();
  const platform = getPlatform();

  try {
    // 1) 카카오톡: 전용 스킴이 가장 확실하다(안드/iOS 공통 지원).
    if (kind === 'kakaotalk') {
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
      return { attempted: true, needsManual: false };
    }

    // 2) 안드로이드 웹뷰(카톡 외): intent 스킴으로 외부 열기. 크롬 지정.
    //    크롬 미설치 등 실패 시 브라우저 선택창/마켓으로 폴백되며, 그래도 안 되면 수동 안내가 남는다.
    if (platform === 'android') {
      const intentUrl =
        `intent://${stripScheme(url)}` +
        `#Intent;scheme=https;package=com.android.chrome;` +
        `S.browser_fallback_url=${encodeURIComponent(url)};end`;
      window.location.href = intentUrl;
      return { attempted: true, needsManual: false };
    }

    // 3) iOS 인앱 웹뷰: 강제 외부 열기 수단이 없다 → 수동 안내(복사) 필요.
    if (platform === 'ios') {
      return { attempted: false, needsManual: true };
    }

    // 4) 그 외: 새 창 열기 시도(데스크톱 인앱 등 드문 케이스).
    window.open(url, '_blank', 'noopener,noreferrer');
    return { attempted: true, needsManual: false };
  } catch {
    // 어떤 실패든 호출측이 복사 폴백으로 처리하도록.
    return { attempted: false, needsManual: true };
  }
}

/** 현재 URL을 클립보드에 복사한다(폴백 UI용). 성공 여부 반환. */
export async function copyCurrentUrl(url: string = currentUrl()): Promise<boolean> {
  if (!url) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // execCommand 폴백으로 진행
  }
  // 구형/웹뷰 환경 폴백: 임시 textarea + execCommand('copy').
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
