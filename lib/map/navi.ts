// 카카오맵 길안내(길찾기) 실행 헬퍼.
// 웹 자체 턴바이턴은 불가하므로, 도착지를 미리 채운 채로 카카오맵을 띄워
// "경로 안내가 곧바로 시작"되도록 한다.
//
// 동작 전략 (환경별):
//  - 모바일: 카카오맵 공식 매핑 URL(`https://map.kakao.com/link/to/…`)로 같은 탭 이동.
//    카카오가 앱 설치 시 앱으로 핸드오프, 미설치 시 웹/설치 안내로 연결한다.
//  - 데스크톱: 카카오맵 웹 길찾기 URL로 새 탭을 연다.
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
 * 도착지 설정된 채로 카카오맵 길안내를 시작한다.
 *  - 모바일: 카카오맵 공식 매핑 URL(`https://map.kakao.com/link/to/…`)로 같은 탭 이동.
 *    카카오가 앱 설치 시 앱으로 핸드오프, 미설치 시 웹/설치 안내로 연결해 준다.
 *    (kakaomap:// 스킴 직접 호출은 iOS Safari에서 앱 미설치 시 "주소가 유효하지 않습니다"
 *     시스템 경고를 띄우고, setTimeout 폴백의 window.open은 팝업 차단에 걸린다.)
 *    앱은 길안내 시작 시 현재 위치를 출발지로 잡으므로 출발지 전달은 생략해도 UX가 같다.
 *  - 데스크톱: 웹 길찾기로 새 탭.
 */
export async function startKakaoNavi(dest: NaviDestination, origin?: NaviOrigin | null): Promise<void> {
  if (typeof window === 'undefined') return;

  if (!isMobile()) {
    openWebDirections(dest, origin);
    return;
  }

  // 모바일: 공식 매핑 URL(도착지 링크)로 같은 탭 이동 — 사용자 제스처 안에서 실행되므로 차단 없음.
  window.location.href = kakaoMapDirectionsUrl(dest, null);
}
