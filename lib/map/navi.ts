// 카카오내비 길안내 실행 헬퍼.
// 웹 자체 턴바이턴은 불가하므로, 카카오내비 앱으로 deep-link 하여 길안내를 시작한다.
//
// 구현: 카카오 JavaScript SDK(`Kakao.Navi.start`)를 사용한다.
//  - 카카오맵 SDK와는 별개의 스크립트(t1.kakaocdn.net)이며, 동일한 JavaScript 앱키로
//    `Kakao.init()` 한 뒤 호출한다(`NEXT_PUBLIC_KAKAO_MAP_KEY` 재사용).
//  - 앱 미설치 시 SDK가 설치 페이지로 유도한다.
// Mock/키 미설정/SDK 로드 실패 시에는 카카오맵 길찾기 웹 링크로 폴백한다.

interface KakaoSdk {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Navi: {
    start: (opts: { name: string; x: number; y: number; coordType: 'wgs84' | 'katec' }) => void;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

const KAKAO_JS_SDK_SRC = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
let sdkPromise: Promise<KakaoSdk | null> | null = null;

/** 카카오 JavaScript SDK를 1회 로드 + init. 실패 시 null. */
function loadKakaoJsSdk(): Promise<KakaoSdk | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Kakao?.Navi) {
    ensureInit(window.Kakao);
    return Promise.resolve(window.Kakao);
  }
  if (sdkPromise) return sdkPromise;

  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (!key) return Promise.resolve(null);

  sdkPromise = new Promise<KakaoSdk | null>((resolve) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = KAKAO_JS_SDK_SRC;
    script.onload = () => {
      const sdk = window.Kakao;
      if (!sdk) return resolve(null);
      ensureInit(sdk);
      resolve(sdk);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function ensureInit(sdk: KakaoSdk) {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (key && !sdk.isInitialized()) sdk.init(key);
}

export interface NaviDestination {
  name: string;
  lat: number;
  lng: number;
}

/** 카카오맵 웹 길찾기 링크(폴백용). 새 탭 열기. */
export function kakaoMapDirectionsUrl(dest: NaviDestination): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(dest.name)},${dest.lat},${dest.lng}`;
}

/**
 * 카카오내비로 길안내를 시작한다.
 * SDK 사용 가능 시 `Kakao.Navi.start`로 앱을 실행하고,
 * 불가능하면(키 미설정/로드 실패/Mock) 카카오맵 웹 길찾기로 폴백한다.
 */
export async function startKakaoNavi(dest: NaviDestination): Promise<void> {
  const sdk = await loadKakaoJsSdk();
  if (sdk?.Navi) {
    try {
      sdk.Navi.start({ name: dest.name, x: dest.lng, y: dest.lat, coordType: 'wgs84' });
      return;
    } catch {
      // SDK 호출 실패 시 웹 링크로 폴백
    }
  }
  if (typeof window !== 'undefined') {
    window.open(kakaoMapDirectionsUrl(dest), '_blank', 'noopener,noreferrer');
  }
}
