// 카카오맵 길안내(길찾기) 실행 헬퍼.
// 웹 자체 턴바이턴은 불가하므로, 도착지(가능하면 출발지까지)를 미리 채운 채로
// 카카오맵을 띄워 "경로 안내가 곧바로 시작"되도록 한다.
//
// 동작 전략 (환경별):
//  - 모바일: 카카오맵 앱 URL 스킴 `kakaomap://route?sp=..&ep=..&by=car`로 deep-link.
//    출발지(sp)가 있으면 출발→도착 경로가, 없으면 앱이 현재 위치를 출발지로 잡아 경로가 바로 뜬다.
//    스킴이 처리되지 않으면(앱 미설치 등) 일정 시간 후 웹 길찾기로 폴백한다.
//  - 데스크톱: 앱 스킴이 동작하지 않으므로 카카오맵 웹 길찾기 URL로 새 탭을 연다.
//    출발지가 있으면 출발/도착이 모두 채워진 경로 화면이, 없으면 도착지가 채워진 길찾기 화면이 뜬다.
// Mock/키 미설정과 무관하게(별도 키가 필요 없는 링크 방식이라) 항상 동작한다.

export interface NaviDestination {
  name: string;
  lat: number;
  lng: number;
}

export interface NaviOrigin {
  /** 출발지 표시 이름. 미지정 시 "내 위치" */
  name?: string;
  lat: number;
  lng: number;
}

/** UA 기반 모바일 판별 (앱 스킴 동작 가능 환경 추정) */
function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * 카카오맵 앱 URL 스킴(`kakaomap://route`). 자동차 경로로 길안내를 시작한다.
 * 좌표 순서는 위도,경도(WGS84). 출발지가 있으면 sp로 함께 넘긴다.
 */
export function kakaoNaviSchemeUrl(dest: NaviDestination, origin?: NaviOrigin | null): string {
  const params = new URLSearchParams();
  if (origin) params.set('sp', `${origin.lat},${origin.lng}`);
  params.set('ep', `${dest.lat},${dest.lng}`);
  params.set('by', 'car');
  return `kakaomap://route?${params.toString()}`;
}

/**
 * 카카오맵 웹 길찾기 링크(데스크톱/폴백용).
 * 출발지가 있으면 sName/eName + from/to(위도,경도)로 경로 화면을 연다.
 * 출발지가 없으면 도착지만 채워진 길찾기 링크(`link/to`)로 폴백한다.
 */
export function kakaoMapDirectionsUrl(dest: NaviDestination, origin?: NaviOrigin | null): string {
  if (origin) {
    const params = new URLSearchParams({
      sName: origin.name ?? '내 위치',
      eName: dest.name,
      from: `${origin.lat},${origin.lng}`,
      to: `${dest.lat},${dest.lng}`,
    });
    return `https://map.kakao.com/?${params.toString()}`;
  }
  // 출발지 미상: 도착지만 채운 길찾기 링크. 좌표 순서는 name,위도,경도.
  return `https://map.kakao.com/link/to/${encodeURIComponent(dest.name)},${dest.lat},${dest.lng}`;
}

/** 새 탭으로 웹 길찾기 열기 */
function openWebDirections(dest: NaviDestination, origin?: NaviOrigin | null) {
  if (typeof window === 'undefined') return;
  window.open(kakaoMapDirectionsUrl(dest, origin), '_blank', 'noopener,noreferrer');
}

/**
 * 도착지(가능하면 출발지까지) 설정된 채로 카카오맵 길안내를 시작한다.
 *  - 모바일: 앱 스킴으로 경로 안내 즉시 시작. 미설치 시 1.2초 후 웹 길찾기 폴백.
 *  - 데스크톱: 웹 길찾기로 새 탭.
 */
export async function startKakaoNavi(dest: NaviDestination, origin?: NaviOrigin | null): Promise<void> {
  if (typeof window === 'undefined') return;

  if (!isMobile()) {
    openWebDirections(dest, origin);
    return;
  }

  // 모바일: 앱 스킴 시도 → 처리되지 않으면 웹 길찾기로 폴백.
  let fellBack = false;
  const fallback = () => {
    if (fellBack) return;
    fellBack = true;
    openWebDirections(dest, origin);
  };

  // 앱이 포그라운드를 가져가면(=스킴 처리됨) 페이지가 숨겨지므로 폴백을 취소한다.
  const onVisibility = () => {
    if (document.hidden) {
      fellBack = true; // 앱 전환됨 → 폴백 불필요
      clearTimeout(timer);
    }
  };
  document.addEventListener('visibilitychange', onVisibility, { once: true });

  const timer = window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    fallback();
  }, 1200);

  // 스킴 실행
  window.location.href = kakaoNaviSchemeUrl(dest, origin);
}
