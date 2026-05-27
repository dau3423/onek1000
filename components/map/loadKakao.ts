// 카카오맵 SDK를 한 번만 로드하는 헬퍼.
// next/script로도 가능하지만 명시적 Promise 컨트롤이 더 깔끔.

let loaderPromise: Promise<typeof kakao> | null = null;

export function loadKakao(): Promise<typeof kakao> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.kakao && window.kakao.maps) return Promise.resolve(window.kakao);
  if (loaderPromise) return loaderPromise;

  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (!key) return Promise.reject(new Error('NEXT_PUBLIC_KAKAO_MAP_KEY missing'));

  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=clusterer`;
    script.onload = () => {
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => reject(new Error('Failed to load Kakao Maps SDK'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}
