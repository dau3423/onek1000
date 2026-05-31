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
    // clusterer(지도/마커 클러스터링) + services(장소·주소 키워드 검색) 라이브러리 로드.
    // services는 경로별 최저가 페이지의 장소 검색에 사용. 전역 로드라 기존 지도/클러스터러 동작에는 영향 없음.
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=clusterer,services`;
    script.onload = () => {
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => reject(new Error('Failed to load Kakao Maps SDK'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}
