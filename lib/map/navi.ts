// 길안내(길찾기) 실행 헬퍼 — 카카오맵 · T맵 · 네이버지도 3종.
// 웹 자체 턴바이턴은 불가하므로, 도착지를 미리 채운 채로 각 지도 앱을 띄워
// "경로 안내가 곧바로 시작"되도록 한다.
//
// 웹은 앱 설치 여부를 감지할 수 없으므로 사용자가 직접 앱을 고르는 방식이며(선택 시트),
// 마지막 선택을 localStorage에 기억한다.
//
// 앱별 동작 전략 (환경별):
//  - 카카오맵: 모바일=공식 매핑 URL(`https://map.kakao.com/link/to/…`) 같은 탭 이동
//    (앱 설치 시 핸드오프, 미설치 시 웹/설치 안내). 데스크톱=웹 길찾기 새 탭.
//  - T맵: 공식 스킴 `tmap://route`(WGS84, goalx=경도/goaly=위도). 웹이 없어 모바일 전용.
//  - 네이버지도: 공식 스킴 `nmap://route/car`(appname 필수). 데스크톱=네이버지도 웹 길찾기 새 탭.
//
// 스킴 방식(T맵/네이버)은 앱이 없으면 OS가 자체 안내를 띄운다 — 사용자가 직접 고른 앱이므로 허용.
// (kakao처럼 자동 폴백 타이머는 두지 않는다 — iOS 팝업 차단/경고를 유발하는 안티패턴.)
// Mock/키 미설정과 무관하게(별도 키가 필요 없는 링크/스킴 방식이라) 항상 동작한다.

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
  /**
   * GPS 현재 위치로 만들어진 출발지인지 여부(표시/URL 전달용 name과 별개로, 동일성 판정이
   * 필요해지면 여기를 봐야 한다 — name은 로케일별 문구라 비교에 쓰면 안 된다).
   * 현재는 어디서도 비교하지 않고 정보용으로만 채워둔다(RoutePoint.isMyLocation과 동형 유지).
   */
  isMyLocation?: boolean;
}

/** 지원하는 내비 앱 식별자 */
export type NaviProvider = 'kakao' | 'tmap' | 'naver';

/** 앱 표시명(UI 문구용). 내비 앱 고유명사 — 로케일 무관하게 번역하지 않는다(navi 선택 시트의 R16과 일관). */
export const NAVI_PROVIDER_LABEL: Record<NaviProvider, string> = {
  // i18n-ignore: 내비 앱 고유명사(카카오맵) — 번역하지 않는다.
  kakao: '카카오맵',
  // i18n-ignore: 내비 앱 고유명사(T맵) — 번역하지 않는다.
  tmap: 'T맵',
  // i18n-ignore: 내비 앱 고유명사(네이버지도) — 번역하지 않는다.
  naver: '네이버지도',
};

/** 네이버지도 URL Scheme에 전달하는 앱 식별자(appname 필수 파라미터) */
const NAVER_APP_NAME = 'kr.onek1000';

/** 마지막으로 선택한 내비 앱 저장 키 */
const PREFERRED_KEY = 'navi:preferred-app';

/** UA 기반 모바일 판별 (앱 스킴 동작 가능 환경 추정) */
function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** 현재 환경(모바일/데스크톱)에서 실행 가능한 내비 앱 목록. T맵은 웹이 없어 모바일 전용. */
export function availableNaviProviders(): NaviProvider[] {
  return isMobile() ? ['kakao', 'tmap', 'naver'] : ['kakao', 'naver'];
}

/** 저장된 선호 내비 앱 조회. 없거나 현재 환경에서 쓸 수 없으면 null. (SSR 가드) */
export function getPreferredNavi(): NaviProvider | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(PREFERRED_KEY);
    return v === 'kakao' || v === 'tmap' || v === 'naver' ? v : null;
  } catch {
    return null;
  }
}

/** 선호 내비 앱 저장. (SSR 가드) */
export function setPreferredNavi(provider: NaviProvider): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFERRED_KEY, provider);
  } catch {
    // localStorage 사용 불가(사생활 보호 모드 등) — 기억 없이 진행.
  }
}

/**
 * 카카오맵 웹 길찾기 링크(데스크톱/폴백용).
 * 출발지가 있으면 sName/eName + from/to(위도,경도)로 경로 화면을 연다.
 * 출발지가 없으면 도착지만 채워진 길찾기 링크(`link/to`)로 폴백한다.
 */
export function kakaoMapDirectionsUrl(dest: NaviDestination, origin?: NaviOrigin | null): string {
  if (origin) {
    const params = new URLSearchParams({
      // i18n-ignore: 외부 내비 앱(카카오맵)에 넘기는 sName 파라미터 — 받는 앱이 한국어 앱이라 한국어가 자연스럽다.
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

/**
 * T맵 길안내 스킴 URL.
 * 공식(커뮤니티 정착) 포맷: `tmap://route?goalname={이름}&goalx={경도}&goaly={위도}` (WGS84).
 * x=경도, y=위도임에 주의. 공백은 스킴에서 `+`가 리터럴로 해석될 수 있어 encodeURIComponent(%20) 사용.
 */
export function tmapNaviUrl(dest: NaviDestination): string {
  return `tmap://route?goalname=${encodeURIComponent(dest.name)}&goalx=${dest.lng}&goaly=${dest.lat}`;
}

/**
 * 네이버지도 자동차 길안내 스킴 URL.
 * 공식 포맷: `nmap://route/car?dlat={위도}&dlng={경도}&dname={이름}&appname={앱식별자}`.
 * appname은 필수(모바일 웹은 서비스 식별자). 출발지가 있으면 slat/slng/sname도 채운다.
 */
export function naverNaviUrl(dest: NaviDestination, origin?: NaviOrigin | null): string {
  const parts = [
    `dlat=${dest.lat}`,
    `dlng=${dest.lng}`,
    `dname=${encodeURIComponent(dest.name)}`,
  ];
  if (origin) {
    parts.push(
      `slat=${origin.lat}`,
      `slng=${origin.lng}`,
      // i18n-ignore: 외부 내비 앱(네이버지도)에 넘기는 sname 파라미터 — 받는 앱이 한국어 앱이라 한국어가 자연스럽다.
      `sname=${encodeURIComponent(origin.name ?? '내 위치')}`,
    );
  }
  parts.push(`appname=${NAVER_APP_NAME}`);
  return `nmap://route/car?${parts.join('&')}`;
}

/** 네이버지도 웹 길찾기 URL(데스크톱용). 도착지 좌표/이름으로 자동차 경로를 연다(best-effort). */
export function naverWebDirectionsUrl(dest: NaviDestination): string {
  return `https://map.naver.com/p/directions/-/${dest.lng},${dest.lat},${encodeURIComponent(dest.name)}/-/car`;
}

/**
 * 선택된 앱으로 길안내를 시작한다(선택 시트/선호앱 실행의 단일 진입점).
 *  - kakao: startKakaoNavi(모바일=매핑 URL, 데스크톱=웹 새 탭).
 *  - tmap: 스킴(모바일 전용). 출발지는 앱이 현재 위치로 잡으므로 전달하지 않는다.
 *  - naver: 모바일=스킴, 데스크톱=웹 길찾기 새 탭.
 */
export async function startNavi(
  provider: NaviProvider,
  dest: NaviDestination,
  origin?: NaviOrigin | null,
): Promise<void> {
  if (typeof window === 'undefined') return;

  switch (provider) {
    case 'kakao':
      await startKakaoNavi(dest, origin);
      return;
    case 'tmap':
      // 스킴 방식 — 사용자 제스처 안에서 같은 탭 이동. 앱 미설치 시 OS 자체 안내(허용).
      window.location.href = tmapNaviUrl(dest);
      return;
    case 'naver':
      if (!isMobile()) {
        window.open(naverWebDirectionsUrl(dest), '_blank', 'noopener,noreferrer');
        return;
      }
      window.location.href = naverNaviUrl(dest, origin);
      return;
  }
}
