'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { Header } from '@/components/ui/Header';
import { FilterBar } from '@/components/ui/FilterBar';
import { BottomSheet, SHEET_PEEK_PX } from '@/components/ui/BottomSheet';
import { BannerAd, BANNER_BOTTOM_PX, BANNER_HEIGHT_PX, useBannerVisible } from '@/components/ads/BannerAd';
import { RadiusAlert } from '@/components/alert/RadiusAlert';
import { RouteAlert } from '@/components/alert/RouteAlert';
import { PriceTrendBanner } from '@/components/alert/PriceTrendBanner';
import { ForecastCard } from '@/components/forecast/ForecastCard';
import { NaviConfirm } from '@/components/alert/NaviConfirm';
import { ProductSync } from '@/components/map/ProductSync';
import { StationPopup } from '@/components/map/StationPopup';
import { EvStationPopup } from '@/components/map/EvStationPopup';
import { FuelDwellPrompt } from '@/components/station/FuelDwellPrompt';
import { useFuelDwellDetect, type DwellStation } from '@/hooks/useFuelDwellDetect';
import { MarkerLegend } from '@/components/ui/MarkerLegend';
import { InstallBanner } from '@/components/pwa/InstallBanner';
// 웰컴 프로모(1주일 무료 프리미엄 팝업) 노출 중단 — 되살리려면 이 import와 아래 <WelcomePromo /> 주석을 해제.
// import { WelcomePromo } from '@/components/promo/WelcomePromo';
import { BusinessFooter } from '@/components/legal/BusinessFooter';
import { useMapStore, getInitialMapView, getInitialRoutePlan, type MapView } from '@/stores/map';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useFullscreen } from '@/hooks/useFullscreen';
import { quantize, distanceMeters, distancePointToPath } from '@/lib/map/geo';
import { ensureNotifyPermission } from '@/lib/sound';
import { GRAY_DOTS_ENABLED } from '@/lib/flags';
import type { BboxResponse, RadiusResponse, StationWithPrice, NationalTop10Item, NationalTop10Response, StationPoint, StationsInBboxResponse, RoutePlan, ProductCode } from '@/types/station';
import type { EvBboxResponse, EvStationMarker } from '@/types/ev';

// KakaoMap은 window 의존 + SDK 외부 스크립트라 SSR 비활성
const KakaoMap = dynamic(
  () => import('@/components/map/KakaoMap').then((m) => m.KakaoMap),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-gray-500">지도 로딩 중...</div> },
);

const ALERT_THRESHOLD = 50; // 평균 대비 -50원 이상 저렴할 때 알람
const ALERT_RADIUS_M = 1000; // 알람 판정 반경 (FR-2.3)
// 경로 주행 중 '경로상 최저가 주유소' 근접 알림 판정 반경 (내 주변 알람과 동일 1km, 조정 가능)
const ROUTE_ALERT_RADIUS_M = 1000;
// 표시 중인 배너를 자동으로 닫는 '이탈' 반경. 진입(1km)보다 크게 잡아 히스테리시스를 둔다
// — GPS 지터로 1km 경계에서 들락거려도 배너가 깜빡이지 않게(주유소를 "지나간" 경우만 닫힘).
const ROUTE_ALERT_EXIT_M = 1200;
// === 경로 이탈 자동 재탐색 파라미터 ===
// 도로 path로부터 이 거리(m)를 초과하면 '이탈 후보'로 본다.
const OFF_ROUTE_M = 150;
// 연속으로 이 횟수 이상 이탈 후보면 실제 이탈로 확정(GPS 튐 1~2회로 인한 오재탐색 방지).
const OFF_ROUTE_HITS = 3;
// 재탐색 최소 간격(ms). 카카오 directions 과호출/과금(무료 1만/일) 방지.
const REROUTE_MIN_INTERVAL_MS = 30000;
// 도착지 이 거리(m) 이내면 재탐색하지 않는다(거의 다 왔으면 불필요).
const REROUTE_SKIP_NEAR_DEST_M = 1500;
const NEARBY_RADIUS_M = 10000; // '내 주변' 표시 반경 (현재 위치 기준 10km)
// 반경 응답 최대 개수. 내 주변 TOP10(가격 정렬) + 1km 알람 산출(거리 기반)을 한 응답에서
// 모두 뽑아내려면 충분히 커야 한다(10km 내 주유소가 많아도 1km 내 최저가가 잘리지 않게).
const NEARBY_LIMIT = 60;
// 지도에 별도 마커로 표시할 '내 주변(10km)' 최저가 상위 개수
const NEARBY_TOP_N = 10;
// 회색 점(비하이라이트 주유소)을 조회·표시할 줌 임계값. zoom = 15 - 카카오 level.
// KakaoMap의 GRAY_DOT_MAX_LEVEL(=5)과 일치: level ≤ 5 ⇔ zoom ≥ 10(주변 동네가 보이는 수준).
const GRAY_DOT_MIN_ZOOM = 10;
// 회색 점 조회 상한(서버 limit과 정렬). 화면 영역 내로 제한 + 대량 로드 방지.
const GRAY_DOT_LIMIT = 500;

/**
 * "실제 새 경로"를 식별하는 경로 정체성 키.
 * - 출발/도착/유종 + 도로 path(첫·끝점·길이)를 합쳐 만든다.
 * - 새 경로 검색은 물론, 경로 이탈 자동 재탐색(출발=내 위치, path 변경)도 키가 바뀌므로
 *   "새 경로"로 인식된다. 반면 동일 routePlan 객체로의 단순 재렌더에는 키가 동일해
 *   알림 억제 상태(1회 알림/닫음)가 불필요하게 초기화되지 않는다.
 * - 좌표는 소수 5자리(약 1m)로 절단해 부동소수 미세차로 키가 흔들리지 않게 한다.
 */
function routeIdentityKey(plan: RoutePlan): string {
  const f = (n: number) => n.toFixed(5);
  const head = plan.path[0];
  const tail = plan.path[plan.path.length - 1];
  return [
    f(plan.from.lat), f(plan.from.lng),
    f(plan.to.lat), f(plan.to.lng),
    plan.product,
    plan.path.length,
    head ? `${f(head.lat)},${f(head.lng)}` : '-',
    tail ? `${f(tail.lat)},${f(tail.lng)}` : '-',
  ].join('|');
}

export default function HomePage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { product, brands, alertDismissed, dismissAlert, resetAlert, setLastView, layer, routePlan, setRoutePlan, clearRoutePlan, setProduct } = useMapStore();

  // 회원 전용 동작 가드 — 길찾기/길안내 시작·따라가기는 로그인 회원만 사용(FR-5 기반 UX 정책).
  // 비로그인(unauthenticated)이면 기존 인증 유도 패턴(next-auth signIn, 현재 화면으로 복귀)을
  // 그대로 재사용해 로그인/회원가입을 유도한다(BrandFilter/FavoriteButton/route 페이지와 일관).
  // 세션 확인 중(loading)에는 막지 않고 통과시킨다(깜빡임/오차단 방지). 인증이면 action 실행.
  // 시스템 알림 권한은 "사용자 인터랙션(회원 전용 동작) 직후"에 1회만 자연스럽게 요청한다.
  // 페이지 로드 즉시 무분별 요청 금지. 거부/미지원이면 조용히 인앱음만 사용된다.
  const notifyAsked = useRef(false);
  const requireAuth = useCallback(
    (action: () => void) => {
      if (authStatus === 'unauthenticated') {
        signIn(undefined, { callbackUrl: '/' });
        return;
      }
      // 회원 가드 통과(길안내 시작/따라가기 등 명시적 인터랙션) 시점에 권한 확보 1회 시도.
      if (!notifyAsked.current) {
        notifyAsked.current = true;
        void ensureNotifyPermission();
      }
      action();
    },
    [authStatus],
  );

  // 최신 유종을 항상 참조하기 위한 ref. fetchStations/fetchAllStations 같은 콜백이
  // (지도 idle의 onBoundsChange 등에서) 옛 렌더의 클로저로 호출되더라도, 실제 요청은
  // 항상 "현재 선택된 유종"으로 나가도록 보장한다 — 유종 변경과 idle 타이밍 경쟁 시
  // 이전 유종으로 되돌아가 마커가 갱신 안 되던 버그를 차단한다.
  const productRef = useRef(product);
  useEffect(() => { productRef.current = product; }, [product]);

  // 최신 브랜드 필터를 항상 참조하기 위한 ref. productRef와 동일하게, idle(onBoundsChange)이
  // 옛 렌더 클로저로 발화해도 실제 bbox 요청이 현재 브랜드 필터 기준으로 나가게 한다.
  const brandsRef = useRef(brands);
  useEffect(() => { brandsRef.current = brands; }, [brands]);

  // 마운트 시점에 1회 고정: 직전에 보던 지도 시점(상세 왕복/새로고침 복원).
  // 있으면 그 시점을 초기값으로 쓰고, 자동 위치 센터링을 억제한다.
  const [restoredView] = useState<MapView | null>(() => getInitialMapView());

  // 지도 영역 (bbox) 내 주유소
  const [stations, setStations] = useState<StationWithPrice[]>([]);
  const [averagePrice, setAveragePrice] = useState(1600);

  // 전국 최저가 TOP10 (화면 영역 무관). 핀/메달 강조 대상. 유종 변경 시에만 재조회.
  const [nationalTop10, setNationalTop10] = useState<NationalTop10Item[]>([]);
  const top10Abort = useRef<AbortController | null>(null);
  const lastBoundsRef = useRef<{ swLat: number; swLng: number; neLat: number; neLng: number; zoom: number } | null>(null);
  const bboxAbort = useRef<AbortController | null>(null);

  // 화면 영역 내 "전체 주유소"(가격 유무 무관) — 회색 점(비하이라이트) 렌더용.
  // 일정 줌 이상 확대 시에만 조회한다(줌 게이팅, rate limit/대량 로드 방지).
  const [allStations, setAllStations] = useState<StationPoint[]>([]);
  const allAbort = useRef<AbortController | null>(null);

  // "고속도로 휴게소만" 필터(brands===['EXP'])일 때 사용할 전국 고속도로 주유소 집합.
  // 화면 bbox와 무관하게 전국 EXP를 받아(유종 변경 시 재조회), 줌을 아무리 줄여도 모든 EXP가
  // 보이게 하고(줌 게이팅 면제), 전국 기준 top10(가격순)을 bbox와 무관하게 고정한다.
  // 전국 ~214개로 희소해 전부 그려도 부담이 적다(우리 DB bbox 조회만 — 신규 외부 fetch 아님).
  const [expStations, setExpStations] = useState<StationWithPrice[]>([]);
  const expAbort = useRef<AbortController | null>(null);
  // "고속도로만" 필터 활성 여부(브랜드가 정확히 EXP 하나).
  const expOnly = useMemo(() => brands.length === 1 && brands[0] === 'EXP', [brands]);

  // 전기차 충전소(layer='ev') — 지도 영역 내 충전소 마커. 우리 DB(/api/ev/bbox)만 조회.
  const [evStations, setEvStations] = useState<EvStationMarker[]>([]);
  const evAbort = useRef<AbortController | null>(null);
  // PC: 충전소 마커 클릭 시 요약 팝업 대상
  const [evPopup, setEvPopup] = useState<EvStationMarker | null>(null);

  // 위치 기반 반경 조회 (내 주변 TOP10 + 1km 알람)
  const [geoEnabled, setGeoEnabled] = useState(false);
  const geo = useGeolocation(geoEnabled);

  // 첫 진입 시 항상 위치 추적을 시작한다 (FR-2.1).
  // 복원된 시점(restoredView: 새로고침/상세 왕복)이 있어도 위치 요청은 그대로 수행해야
  // geo.coords가 채워져 '내 주변 10km' radius 조회·마커가 정상 동작한다.
  // 단, 복원된 경우 지도 '중심'은 복원 시점을 유지해야 하므로 KakaoMap에
  // suppressAutoCenter={!!restoredView}를 넘겨 첫 좌표 획득 시 자동 센터링만 억제한다.
  // (즉 "위치는 잡되, 지도는 복원 위치 그대로".) 거부/미지원이면 기존처럼 graceful.
  useEffect(() => {
    setGeoEnabled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [radiusStations, setRadiusStations] = useState<StationWithPrice[]>([]);
  const radiusAbort = useRef<AbortController | null>(null);
  // 100m 이상 의미있는 이동에서만 재조회하기 위한 양자화 키 (FR-2.2)
  const lastRadiusKeyRef = useRef<string | null>(null);
  // 사용자 마지막 위치 저장 throttle — 직전 저장 좌표/시각(과호출 방지: 1km 이동 or 하루 1회)
  const lastSavedLocRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  // 값이 바뀌면 지도가 내 위치로 이동 (버튼 재클릭마다 증가)
  const [recenterSignal, setRecenterSignal] = useState(0);
  // 버튼을 눌렀지만 아직 좌표를 모를 때, 첫 좌표 획득 시 1회 내 위치로 이동시키기 위한 대기 플래그
  const pendingRecenterRef = useRef(false);
  // 따라가기 모드: ON이면 위치 갱신마다 지도가 내 위치를 자동 추적, 사용자가 지도를 드래그하면 자동 OFF
  const [follow, setFollow] = useState(false);
  // ④ 가격 추세 배너용 지도 중심 좌표(GPS 좌표가 없을 때 폴백). 복원 뷰가 있으면 그 중심으로 시작.
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(
    () => (restoredView ? { lat: restoredView.lat, lng: restoredView.lng } : null),
  );

  // 길안내 확인 모달 대상
  const [naviTarget, setNaviTarget] = useState<StationWithPrice | null>(null);

  // 주유소 체류 감지 팝업 대상(감지된 주유소). 저장/닫기 시 null.
  const [dwellStation, setDwellStation] = useState<DwellStation | null>(null);
  // 주유 기록 저장 완료 피드백 토스트.
  const [fuelSavedToast, setFuelSavedToast] = useState(false);

  // 하단 시트 펼침 여부 — GPS 버튼이 시트에 가려지지 않게 위치를 연동한다.
  const [sheetOpen, setSheetOpen] = useState(false);

  // 하단 시트 활성 탭 — 지도 마커에 어느 목록(이 지역/내 주변)을 "순위 숫자"로 표시할지 결정.
  // BottomSheet에서 끌어올린 값. onTabChange는 BottomSheet effect 의존성이므로 안정 참조로 둔다.
  const [activeTab, setActiveTab] = useState<'area' | 'nearby'>('area');
  const handleTabChange = useCallback((t: 'area' | 'nearby') => setActiveTab(t), []);

  // 배너(광고 OFF CTA / AdSense)가 실제로 노출되는지 — BannerAd와 동일한 표시 조건을 공유.
  const bannerVisible = useBannerVisible();

  // GPS 버튼 위치 계산. 맵 컨테이너(relative) 기준이며, 항상 '접힘 상태' 기준의 고정 위치를 쓴다.
  // 시트 펼침/접힘에 따라 위아래로 따라다니지 않는다(시트 펼침 시에는 별도로 버튼을 숨김 처리).
  //  - 배너 표시: 배너 상단 기준 20px 위(bottom 고정).
  //  - 배너 없음: 시트 peek 바로 위(+safe-area).
  const GPS_BANNER_GAP_PX = 20; // 배너 상단과의 간격
  // 배너/시트 peek는 모두 safe-area 미가산 좌표(컨테이너 bottom-0 기준)에 얹힌다.
  // GPS 버튼도 같은 좌표계를 써야 iOS(home indicator)에서만 간격이 벌어지지 않는다.
  const gpsPosition: { top?: string; bottom?: string } = bannerVisible
    ? { top: 'auto', bottom: `${BANNER_BOTTOM_PX + BANNER_HEIGHT_PX + GPS_BANNER_GAP_PX}px` }
    : { top: 'auto', bottom: `${SHEET_PEEK_PX + 12}px` };

  // PC(데스크톱) 판별: lg(1024px) 이상. 마운트 후 클라이언트에서 판별(SSR/CSR 일관성).
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  // PC에서 마커 클릭 시 노출할 정보 카드 팝업 대상 (모바일은 사용 안 함)
  const [popupStation, setPopupStation] = useState<StationWithPrice | null>(null);

  // 지도 색상 안내(ⓘ) 팝오버 열림 여부 — 지도 우측 상단 버튼에서 토글
  const [legendOpen, setLegendOpen] = useState(false);

  // 지도 영역 전체화면 토글. 대상은 map-container(지도 + 버튼/배너/시트 포함).
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(mapContainerRef);

  // 마커 클릭 동작 분기:
  //  - PC: 상세 페이지로 이동하지 않고 요약 정보 카드(팝업)를 띄운다.
  //  - 모바일: 기존 동작 유지 — 상세 페이지로 이동.
  // 일반 마커와 전국 TOP10 메달 마커 모두 onMarkerClick을 경유하므로 동일하게 적용된다.
  function handleMarkerClick(s: StationWithPrice) {
    if (isDesktop) setPopupStation(s);
    // 고속도로 주유소 id('EX-'+코드) 포함 특수문자가 경로에서 깨지지 않도록 인코딩(하이픈/영숫자엔 no-op).
    else router.push(`/station/${encodeURIComponent(s.id)}`);
  }

  // 팝업이 열린 채로 뷰포트가 모바일 폭으로 줄면 팝업을 닫는다(분기 일관성).
  useEffect(() => {
    if (!isDesktop && popupStation) setPopupStation(null);
  }, [isDesktop, popupStation]);

  // 충전소 팝업도 동일하게 — 모바일 폭으로 줄거나 주유소 레이어로 전환되면 닫는다.
  useEffect(() => {
    if ((!isDesktop || layer !== 'ev') && evPopup) setEvPopup(null);
  }, [isDesktop, layer, evPopup]);

  // bbox 변경 시 stations 조회
  useEffect(() => {
    const b = lastBoundsRef.current;
    if (!b) return;
    // 유종 변경 시 현재 화면(bbox) 기준으로 즉시 재조회한다(가격 마커).
    // 브랜드 필터 변경 시에도 재조회한다: "고속도로만"(EXP 단일)으로 전환되면 EXP 전용
    // 서버 조회 경로로, 다시 전체/다중으로 바뀌면 일반 조회 경로로 즉시 갈아끼우기 위함.
    // (회색 점(allStations)은 가격과 무관하므로 재조회하지 않는다 — 줌 게이팅은 bounds/layer effect 담당.)
    fetchStations(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, brands]);

  // 유종 변경 시 전국 최저가 TOP10 재조회 (마운트 1회 + product 변경 시).
  // 화면 영역과 무관하므로 bbox 패닝/줌에는 재호출하지 않는다(캐시/rate limit 보호).
  //
  // 유종 전환 경쟁 방어(bbox fetchStations와 동일 패턴):
  //  - effect 시작 시 이전 요청을 abort하고, cleanup에서도 abort해 빠른 연속 전환/언마운트 시
  //    진행 중 요청이 확실히 취소되게 한다.
  //  - 요청한 유종(reqProduct)을 캡처해, 응답이 abort 직전에 이미 수신을 마쳐 out-of-order로
  //    resolve되더라도 "현재 선택 유종"과 다르면 무시한다(옛 유종 TOP10이 화면에 박히는 것 차단).
  //    실증상: 경유→LPG 전환 직후에도 크라운 핀 가격이 경유 값으로 남던 버그(setNationalTop10가
  //    옛 유종 응답으로 덮이는 순서 문제) 차단.
  //  - 응답 캐시 헤더(stale-while-revalidate)로 옛 값이 즉시 반환되어 유종 데이터가 어긋나지 않도록
  //    no-store로 항상 신선한 TOP10을 받는다(전국 1건/유종이라 비용 미미, NFR-3 부합).
  useEffect(() => {
    if (top10Abort.current) top10Abort.current.abort();
    const ac = new AbortController();
    top10Abort.current = ac;
    const reqProduct = product;
    fetch(`/api/stations/top10?product=${reqProduct}`, { signal: ac.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`top10 ${r.status}`);
        return (await r.json()) as NationalTop10Response;
      })
      .then((data) => {
        // 요청 유종이 현재 유종과 다르면 무시(out-of-order 방어).
        if (reqProduct !== productRef.current) return;
        setNationalTop10(Array.isArray(data?.stations) ? data.stations : []);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error('top10 fetch fail', e);
      });
    return () => ac.abort();
  }, [product]);

  function fetchStations(b: { swLat: number; swLng: number; neLat: number; neLng: number; zoom: number }) {
    if (bboxAbort.current) bboxAbort.current.abort();
    bboxAbort.current = new AbortController();
    // 항상 최신 유종으로 요청한다(클로저 product가 아닌 productRef). 지도 idle이 옛 렌더의
    // onBoundsChange 클로저로 발화해도 현재 유종이 나가도록 보장 → 유종 변경 후 이전 유종으로
    // 되돌아가는 경쟁을 차단한다.
    const reqProduct = productRef.current;
    const params = new URLSearchParams({
      swLat: String(b.swLat), swLng: String(b.swLng),
      neLat: String(b.neLat), neLng: String(b.neLng),
      zoom: String(b.zoom),
      product: reqProduct,
    });
    // "고속도로만" 필터(브랜드가 정확히 EXP 하나)일 때는 EXP만 서버에서 조회한다.
    // 고속도로 주유소는 전국 ~214개로 희소해, 줌 아웃 시 가격순 상한(topNByZoom)에
    // 일반 주유소에 밀려 누락되던 문제를 막는다(서버가 EXP만 충분한 상한으로 반환).
    // 여러 브랜드 동시 선택/미선택(전체)일 때는 기존 동작 유지(전체 조회 후 클라이언트 필터).
    const reqBrands = brandsRef.current;
    if (reqBrands.length === 1 && reqBrands[0] === 'EXP') {
      params.set('brand', 'EXP');
    }
    fetch(`/api/stations/bbox?${params}`, { signal: bboxAbort.current.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`bbox ${r.status}`);
        return (await r.json()) as BboxResponse;
      })
      .then((data) => {
        // 응답이 abort 직전에 이미 resolve 단계였던 경우(out-of-order) 방어:
        // 요청한 유종과 현재 유종이 다르면 무시한다(옛 유종 가격이 화면에 박히는 것 차단).
        if (reqProduct !== productRef.current) return;
        // 오류 응답({error})이나 예기치 못한 형태로 stations가 비어도 마커 렌더가 깨지지 않도록 방어
        const list = Array.isArray(data?.stations) ? data.stations : [];
        setStations(list);
        if (list.length) {
          const avg = Math.round(list.reduce((s, x) => s + x.price, 0) / list.length);
          setAveragePrice(avg);
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error('bbox fetch fail', e);
      });
  }

  // 회색 점(비하이라이트 주유소) 조회 — gas 레이어 + 일정 줌 이상 확대(zoom ≥ GRAY_DOT_MIN_ZOOM)일 때만.
  // 줌아웃 상태에서는 호출하지 않고 기존 점도 비운다(밀도 폭주/불필요 호출 방지).
  function fetchAllStations(b: { swLat: number; swLng: number; neLat: number; neLng: number; zoom: number }) {
    // 회색 점 기능 비활성(플래그) 시: 조회하지 않고 잔여 점도 비운다(불필요 요청 0).
    if (!GRAY_DOTS_ENABLED) {
      if (allStations.length) setAllStations([]);
      return;
    }
    if (b.zoom < GRAY_DOT_MIN_ZOOM) {
      if (allStations.length) setAllStations([]);
      return;
    }
    if (allAbort.current) allAbort.current.abort();
    allAbort.current = new AbortController();
    const params = new URLSearchParams({
      swLat: String(b.swLat), swLng: String(b.swLng),
      neLat: String(b.neLat), neLng: String(b.neLng),
      zoom: String(b.zoom), limit: String(GRAY_DOT_LIMIT),
    });
    fetch(`/api/stations/all-in-bbox?${params}`, { signal: allAbort.current.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`all-in-bbox ${r.status}`);
        return (await r.json()) as StationsInBboxResponse;
      })
      .then((data) => {
        setAllStations(Array.isArray(data?.stations) ? data.stations : []);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error('all-in-bbox fetch fail', e);
      });
  }

  // 전국 고속도로(EXP) 주유소 조회 — "고속도로만" 필터일 때만 호출.
  // 전국 bbox(한반도 전체)를 brand=EXP로 한 번 받아(우리 DB bbox 조회만), 화면 줌/패닝과
  // 무관하게 모든 EXP를 보유한다. 응답 상한(BRAND_ONLY_LIMIT=300) 안에 전국 ~214개가 다 담긴다.
  // 유종이 바뀌면 가격이 달라지므로(top10 정렬 기준) 재조회한다.
  function fetchExpStations(reqProduct: ProductCode) {
    if (expAbort.current) expAbort.current.abort();
    expAbort.current = new AbortController();
    const params = new URLSearchParams({
      // 한반도를 넉넉히 덮는 전국 bbox(제주~강원/울릉 포함). brand=EXP라 EXP만 반환된다.
      swLat: '33.0', swLng: '124.5', neLat: '38.7', neLng: '132.0',
      zoom: '7', product: reqProduct, brand: 'EXP',
    });
    fetch(`/api/stations/bbox?${params}`, { signal: expAbort.current.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`exp bbox ${r.status}`);
        return (await r.json()) as BboxResponse;
      })
      .then((data) => {
        // out-of-order 방어: 요청 유종이 현재 유종과 다르면 무시.
        if (reqProduct !== productRef.current) return;
        setExpStations(Array.isArray(data?.stations) ? data.stations : []);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error('exp bbox fetch fail', e);
      });
  }

  // "고속도로만" 필터 진입/해제 + 유종 변경 시 전국 EXP 집합을 갱신한다.
  //  - expOnly 진입: 전국 EXP를 받아 모든 EXP 표시 + 전국 top10 고정.
  //  - expOnly 해제: 진행 중 요청 취소 + 집합 비움(EXP 전용 렌더 종료, 일반 마커로 복귀).
  useEffect(() => {
    if (!expOnly) {
      if (expAbort.current) { expAbort.current.abort(); expAbort.current = null; }
      if (expStations.length) setExpStations([]);
      return;
    }
    fetchExpStations(product);
    return () => { if (expAbort.current) expAbort.current.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expOnly, product]);

  // 충전소 마커 조회 — layer='ev'일 때만 호출. 우리 DB(/api/ev/bbox)만 조회(data.go.kr는 sync 전용).
  function fetchEvStations(b: { swLat: number; swLng: number; neLat: number; neLng: number }) {
    if (evAbort.current) evAbort.current.abort();
    evAbort.current = new AbortController();
    const params = new URLSearchParams({
      swLat: String(b.swLat), swLng: String(b.swLng),
      neLat: String(b.neLat), neLng: String(b.neLng),
    });
    fetch(`/api/ev/bbox?${params}`, { signal: evAbort.current.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`ev bbox ${r.status}`);
        return (await r.json()) as EvBboxResponse;
      })
      .then((data) => {
        setEvStations(Array.isArray(data?.stations) ? data.stations : []);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error('ev bbox fetch fail', e);
      });
  }

  // 레이어 전환 시 현재 화면 영역으로 즉시 재조회.
  // - ev: 충전소 조회. gas: 기존 주유소 조회(stations는 product effect/bounds로도 갱신되나 일관성 위해 트리거).
  useEffect(() => {
    const b = lastBoundsRef.current;
    if (!b) return;
    if (layer === 'ev') { fetchEvStations(b); setAllStations([]); }
    else { fetchStations(b); fetchAllStations(b); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  // 버튼으로 내 위치를 요청했는데 아직 좌표가 없던 경우(복원 모드 등 자동 센터링이 꺼진 상황),
  // 첫 좌표 획득 시 1회 내 위치로 이동시킨다.
  useEffect(() => {
    if (geo.coords && pendingRecenterRef.current) {
      pendingRecenterRef.current = false;
      setRecenterSignal((n) => n + 1);
    }
  }, [geo.coords]);

  // 내 위치 변경 시 반경 조회.
  // GPS가 watchPosition으로 자주 갱신되므로, 좌표를 ~110m로 양자화해
  // 의미있는 이동(약 100m 이상)에서만 재조회한다 (FR-2.2, rate limit 보호).
  useEffect(() => {
    if (!geo.coords) return;
    const key = quantize(geo.coords.lat, geo.coords.lng, 3);
    if (key === lastRadiusKeyRef.current) return;
    lastRadiusKeyRef.current = key;

    if (radiusAbort.current) radiusAbort.current.abort();
    radiusAbort.current = new AbortController();
    const params = new URLSearchParams({
      lat: String(geo.coords.lat), lng: String(geo.coords.lng),
      r: String(NEARBY_RADIUS_M), product, limit: String(NEARBY_LIMIT),
    });
    fetch(`/api/stations/radius?${params}`, { signal: radiusAbort.current.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`radius ${r.status}`);
        return (await r.json()) as RadiusResponse;
      })
      .then((data) => {
        const list = Array.isArray(data?.stations) ? data.stations : [];
        setRadiusStations(list);
        resetAlert();
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error('radius fetch fail', e);
      });
    // geo.coords 전체가 아닌 위경도 변화에만 반응 (양자화 게이트로 재조회 빈도 제어)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.coords?.lat, geo.coords?.lng, product, resetAlert]);

  // 로그인 사용자 마지막 위치 저장(③ 주간 다이제스트 cron이 "내 지역"을 알기 위함).
  // 과호출 방지: 직전 저장 대비 1km 이상 이동했거나 하루(24h) 지났을 때만 POST. best-effort(실패 무시).
  useEffect(() => {
    if (authStatus !== 'authenticated' || !geo.coords) return;
    const { lat, lng } = geo.coords;
    const prev = lastSavedLocRef.current;
    const now = Date.now();
    const moved = !prev || distanceMeters(prev.lat, prev.lng, lat, lng) >= 1000;
    const stale = !prev || now - prev.at >= 24 * 60 * 60 * 1000;
    if (!moved && !stale) return;
    lastSavedLocRef.current = { lat, lng, at: now };
    fetch('/api/user/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
      keepalive: true,
    }).catch(() => { /* best-effort — 실패 무시 */ });
    // 좌표 변화에만 반응(geo.coords 전체 의존 시 watch 갱신마다 재실행) — radius 효과와 동일 패턴.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, geo.coords?.lat, geo.coords?.lng]);

  // 내 주변(10km) 최저가 TOP10 — 지도에 별도 마커로 표시.
  // radius 응답은 이미 가격 오름차순으로 정렬되어 오므로 상위 N건을 그대로 사용한다.
  // (좌표가 없으면 빈 배열 → 마커 미표시)
  const nearbyTop10 = useMemo<StationWithPrice[]>(() => {
    if (!geo.coords) return [];
    return [...radiusStations]
      .sort((a, b) => a.price - b.price)
      .slice(0, NEARBY_TOP_N);
  }, [radiusStations, geo.coords]);

  // 브랜드 필터(회원 전용, 빈 배열=전체) — 지도 마커 표시 집합에 일관 적용.
  // 알람/하단 시트 등 '내 주변 데이터' 본연의 동작에는 영향을 주지 않고, 마커 노출만 좁힌다.
  const brandSet = useMemo(() => new Set(brands), [brands]);
  const matchBrand = useMemo(
    () => (b: string) => brandSet.size === 0 || brandSet.has(b as never),
    [brandSet],
  );
  const visibleStations = useMemo(
    () => (brandSet.size === 0 ? stations : stations.filter((s) => matchBrand(s.brand))),
    [stations, brandSet, matchBrand],
  );
  const visibleNationalTop10 = useMemo(
    () => (brandSet.size === 0 ? nationalTop10 : nationalTop10.filter((s) => matchBrand(s.brand))),
    [nationalTop10, brandSet, matchBrand],
  );
  const visibleNearbyTop10 = useMemo(
    () => (brandSet.size === 0 ? nearbyTop10 : nearbyTop10.filter((s) => matchBrand(s.brand))),
    [nearbyTop10, brandSet, matchBrand],
  );
  // 전국 최저가 TOP10 id→순위 맵. 하단 시트 목록에서 해당 주유소 행을 "반짝이는 황금색"으로
  // 강조하기 위해 전달한다(목록은 bbox/radius 기반이라 전국 TOP10이 보일 때만 적용됨).
  const nationalTop10Rank = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of visibleNationalTop10) m.set(t.id, t.rank);
    return m;
  }, [visibleNationalTop10]);
  // 하단 시트 리스트도 동일 브랜드 필터 적용(표시 집합 일관성).
  // averagePrice는 1km 알람 판정(평균-50원) 기준으로 사용한다. 마커 색상은 별도로
  // 화면 표시 집합의 상대 분포(분위수)로 산정한다(KakaoMap/BottomSheet 내부).
  const visibleNearbyStations = useMemo(
    () => (brandSet.size === 0 ? radiusStations : radiusStations.filter((s) => matchBrand(s.brand))),
    [radiusStations, brandSet, matchBrand],
  );
  // 회색 점도 동일 브랜드 필터 적용(표시 집합 일관성).
  const visibleAllStations = useMemo(
    () => (brandSet.size === 0 ? allStations : allStations.filter((s) => matchBrand(s.brand))),
    [allStations, brandSet, matchBrand],
  );

  // 1km 반경 최저가 (알람 판정용)
  const cheapestWithin1km = useMemo(() => {
    const within = radiusStations
      .filter((s) => (s.distance ?? Infinity) <= ALERT_RADIUS_M)
      .sort((a, b) => a.price - b.price);
    return within[0] ?? null;
  }, [radiusStations]);

  // 알람 대상: 지도 영역 평균 대비 ALERT_THRESHOLD 이상 싼 1km 내 최저가
  const alertStation = useMemo(() => {
    if (!cheapestWithin1km) return null;
    return averagePrice - cheapestWithin1km.price >= ALERT_THRESHOLD ? cheapestWithin1km : null;
  }, [cheapestWithin1km, averagePrice]);

  const myLocation = geo.coords ?? null;

  // === 경로별 최저가: 콜드 리로드 견고성을 위한 store hydrate ===
  // route 페이지 → '/' SPA 네비에서는 zustand 메모리 상태(routePlan)가 그대로 유지되지만,
  // 새로고침/백그라운드 후 콜드 리로드 시엔 store가 비므로 localStorage(getInitialRoutePlan)에서
  // 만료(3시간) 이내 경로를 1회 복원한다.
  useEffect(() => {
    if (useMapStore.getState().routePlan) return; // 이미 메모리에 있으면(네비 직후) 그대로 사용
    const restored = getInitialRoutePlan();
    if (restored) useMapStore.getState().setRoutePlan(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 경로 모드 진입 시 GPS 자동 활성화 + 따라가기(follow) 자동 ON.
  // 경로 근접 알림(RouteAlert)·'내 위치' 기준은 GPS watch가 돌아야 동작하므로,
  // routePlan이 활성화되면(직접 검색/콜드 리로드 복원 모두 포함) geoEnabled를 true로 켠다.
  //  - 권한 미허용이면 watch 시작 시 브라우저 권한 프롬프트가 떠 자연스럽게 유도된다.
  //  - 거부/미지원이면 useGeolocation이 graceful fallback(앱 안 깨짐, status denied/unavailable).
  //  - 이미 켜져 있으면 setState(true)가 no-op이라 watch 재시작 없음(idempotent).
  // 추가로 "지도가 내 위치를 따라가는 주행 모드"로 진입시킨다:
  //  - follow=true(이미 true면 idempotent) + recenter 신호로 내 위치로 지도 이동(panTo).
  //  - 좌표를 아직 모르면 pendingRecenter로 대기 → 첫 좌표 획득 시 1회 이동(복원 모드 포함).
  // 종료(clearRoutePlan)/이탈 재탐색 시점엔 follow를 강제로 끄지 않는다(사용자 상태 존중).
  // routePlan 참조가 바뀔 때마다(이탈 재탐색의 setRoutePlan 포함) recenter가 또 나가는 걸
  // 막기 위해, 새 "경로 세션"(from→to 키가 달라질 때)에서만 follow/recenter를 발화한다.
  const prevRouteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routePlan) { prevRouteKeyRef.current = null; return; }
    setGeoEnabled(true);
    const key = `${routePlan.to.lat.toFixed(5)},${routePlan.to.lng.toFixed(5)}|${routePlan.product}`;
    if (prevRouteKeyRef.current === key) return; // 같은 목적지의 재탐색 갱신 → recenter 재발화 안 함
    prevRouteKeyRef.current = key;
    // 따라가기 ON + 내 위치로 이동(좌표 모르면 첫 획득 시 1회 이동).
    setFollow(true);
    if (geo.coords) setRecenterSignal((n) => n + 1);
    else pendingRecenterRef.current = true;
    // geo.coords는 의도적으로 의존성에서 제외(좌표 갱신마다 recenter 재발화 방지) — 진입 시 1회.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePlan]);

  // 경로 모드에서 '경로상 최저가 주유소' 근접 알림 대상.
  // routePlan이 있고 GPS 주행 중일 때, 그 주유소 중 1km 이내로 접근한 가장 가까운 곳을 1회 알린다.
  const [routeAlert, setRouteAlert] = useState<{ station: StationWithPrice; distanceM: number } | null>(null);
  // 이미 알린(근접 트리거된) 주유소 id 집합 — 한 주유소는 1회만 알린다(중복 알림 방지).
  const alertedRouteIdsRef = useRef<Set<string>>(new Set());
  // 사용자가 닫은(✕) + 지나가서 자동으로 닫힌 주유소 id 누적 집합.
  // "현재 경로(세션)" 동안 같은 배너를 다시 띄우지 않기 위한 억제 목록(요청2).
  // 여러 주유소를 닫아도 각각 누적되며, 새 경로로 재탐색되면(아래 키 기반 리셋) 함께 초기화된다.
  const routeAlertDismissedRef = useRef<Set<string>>(new Set());

  // === 알림 억제 상태 리셋 식별(요청1) ===
  // routePlan이 "실제 새 경로"로 바뀔 때만(routeIdentityKey 변경) 1회 알림/닫음 억제를 리셋한다.
  //  - 새 경로 검색: from/to/product/path가 모두 새로 → 키 변경 → 리셋.
  //  - 경로 이탈 자동 재탐색: 출발(내 위치)·도로 path가 바뀜 → 키 변경 → 리셋
  //    → 새 경로 기준 경로상 최저가를 근접 시 다시 알릴 수 있다.
  //  - 동일 routePlan 객체로의 단순 재렌더: 키 동일 → 리셋하지 않음(불필요 깜빡임 방지).
  const routeIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routePlan) {
      routeIdentityRef.current = null;
      alertedRouteIdsRef.current = new Set();
      routeAlertDismissedRef.current = new Set();
      setRouteAlert(null);
      return;
    }
    const key = routeIdentityKey(routePlan);
    if (routeIdentityRef.current === key) return; // 같은 경로 → 억제 상태 유지
    routeIdentityRef.current = key;
    alertedRouteIdsRef.current = new Set();
    routeAlertDismissedRef.current = new Set();
    setRouteAlert(null);
  }, [routePlan]);

  // === 차종 미설정 사용자: 경로 탐색 유종을 메인 지도 선택 유종에 반영 ===
  // 기본 차량 유종(defaultProduct)이 없는 사용자(차종 미선택 + 비로그인 포함)가 /route에서
  // 유종(예: 경유)을 골라 경로를 탐색하면, 메인 지도로 돌아올 때 선택 유종이 그 유종으로
  // 자동 선택되게 한다(요청).
  //  - 조건: defaultProduct 부재일 때만. 차종이 있는 사용자는 기존 동작 유지(자동 변경 안 함).
  //  - "한 번만/덮어쓰기 방지": routeIdentityKey(실제 새 경로) 변경 시에만 1회 반영한다.
  //    → 같은 경로의 단순 재렌더/재탐색 path 갱신엔 product를 건드리지 않고,
  //      사용자가 이후 필터바에서 수동으로 다른 유종을 골라도 그 값이 보존된다.
  //  - 이미 같은 유종이면 setProduct를 호출하지 않아 불필요한 상태 변경/재조회를 막는다.
  const routeProductSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routePlan) { routeProductSyncRef.current = null; return; }
    // 세션은 서버 검증된 값. 차종(기본 차량 유종)이 있으면 자동 변경하지 않는다.
    if (session?.user?.defaultProduct) return;
    const key = routeIdentityKey(routePlan);
    if (routeProductSyncRef.current === key) return; // 동일 경로 → 1회만 반영
    routeProductSyncRef.current = key;
    if (productRef.current !== routePlan.product) setProduct(routePlan.product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePlan, session?.user?.defaultProduct, setProduct]);

  // GPS 위치 변경 시 경로 최저가 주유소 근접 감지(포그라운드 전제, 웹 한계로 백그라운드 제외).
  // 좌표 양자화 게이트(lastRadiusKeyRef와 별개)로 과한 재계산을 피하되, 거리 계산 자체는 가벼우므로
  // 위치 갱신마다 평가한다. 1km 이내 미알림 주유소 중 가장 가까운 곳을 1회 알린다.
  useEffect(() => {
    if (!routePlan || !geo.coords || layer !== 'gas') return;
    const { lat, lng } = geo.coords;
    let nearest: { station: StationWithPrice; distanceM: number } | null = null;
    for (const s of routePlan.stations) {
      if (alertedRouteIdsRef.current.has(s.id)) continue; // 이미 알린 주유소는 건너뜀
      if (routeAlertDismissedRef.current.has(s.id)) continue; // 현재 경로에서 닫은 주유소는 다시 안 띄움(요청2)
      const d = distanceMeters(lat, lng, s.lat, s.lng);
      if (d <= ROUTE_ALERT_RADIUS_M && (!nearest || d < nearest.distanceM)) {
        nearest = { station: s, distanceM: d };
      }
    }
    if (nearest) {
      alertedRouteIdsRef.current.add(nearest.station.id); // 1회만 — 멀어졌다 재접근해도 재알림 안 함
      setRouteAlert(nearest);
    }
    // 위경도 변화에만 반응(heading/accuracy 변경에는 재평가 불필요)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.coords?.lat, geo.coords?.lng, routePlan, layer]);

  // 표시 중인 RouteAlert 주유소를 "지나가면"(멀어지면) 배너를 자동으로 닫는다.
  // 진입(1km)보다 큰 이탈 반경(ROUTE_ALERT_EXIT_M)을 써 히스테리시스를 둬, GPS 지터로
  // 경계에서 들락거려도 깜빡이지 않게 한다. 해당 주유소는 진입 시점에 이미 alertedRouteIdsRef에
  // 추가되어 있으므로(1회 알림 정책), 자동으로 닫힌 뒤 재접근해도 다시 뜨지 않는다.
  useEffect(() => {
    if (!routeAlert || !geo.coords) return;
    const { lat, lng } = geo.coords;
    const d = distanceMeters(lat, lng, routeAlert.station.lat, routeAlert.station.lng);
    if (d > ROUTE_ALERT_EXIT_M) {
      // 사용자가 ✕로 닫은 것과 동일하게 처리(렌더 가드 일관성). 강조도 함께 해제된다.
      // 현재 경로 억제 목록에 누적해, 새 경로로 재탐색되기 전까지 같은 배너가 다시 뜨지 않게 한다(요청2).
      routeAlertDismissedRef.current.add(routeAlert.station.id);
      setRouteAlert(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.coords?.lat, geo.coords?.lng, routeAlert]);

  // === 경로 이탈 자동 재탐색 ===
  // 경로 모드 + GPS 주행 중, 내 위치가 도로 path에서 OFF_ROUTE_M를 OFF_ROUTE_HITS회 연속 초과하면
  // '내 위치 → 기존 도착(유종 유지)'으로 route-cheapest를 재호출해 새 경로/최저가로 갱신한다.
  //  - 가드: 최소 간격(REROUTE_MIN_INTERVAL_MS) + in-flight 중복 금지 + 도착 근처면 스킵.
  //  - 실패 시 기존 경로 유지(앱 안 깨짐). routePlan이 바뀌면(✕/재탐색 성공) 카운터 리셋.
  //  - directions 호출은 서버(route-cheapest) 경유 유지(키 노출 금지).
  const offRouteHitsRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const rerouteInFlightRef = useRef(false);
  const rerouteAbortRef = useRef<AbortController | null>(null);
  const [rerouteToast, setRerouteToast] = useState(false);

  // 경로가 바뀌면(새 검색/재탐색 성공/해제) 이탈 카운터를 초기화한다.
  useEffect(() => {
    offRouteHitsRef.current = 0;
  }, [routePlan]);

  // routePlan 해제 시 진행 중 재탐색 요청을 취소한다(✕ 종료 시 중단).
  useEffect(() => {
    if (!routePlan && rerouteAbortRef.current) {
      rerouteAbortRef.current.abort();
      rerouteAbortRef.current = null;
      rerouteInFlightRef.current = false;
    }
  }, [routePlan]);

  useEffect(() => {
    if (!routePlan || !geo.coords || layer !== 'gas') return;
    const { lat, lng } = geo.coords;

    // 도착지 근처면 재탐색하지 않는다(거의 다 왔으면 불필요한 호출 방지).
    const toDest = distanceMeters(lat, lng, routePlan.to.lat, routePlan.to.lng);
    if (toDest <= REROUTE_SKIP_NEAR_DEST_M) { offRouteHitsRef.current = 0; return; }

    // 현재 위치 ↔ 경로(도로 path) 최소거리로 이탈 여부 판정.
    const off = distancePointToPath(lat, lng, routePlan.path);
    if (off <= OFF_ROUTE_M) { offRouteHitsRef.current = 0; return; }
    offRouteHitsRef.current += 1;
    if (offRouteHitsRef.current < OFF_ROUTE_HITS) return; // 연속 확인 전이면 대기(GPS 튐 방어)

    // 가드: 최소 간격 미경과 또는 재탐색 진행 중이면 스킵.
    const now = Date.now();
    if (rerouteInFlightRef.current) return;
    if (now - lastRerouteAtRef.current < REROUTE_MIN_INTERVAL_MS) return;

    // 재탐색 실행: 출발=현재 위치, 도착=기존 to, 유종=기존 product. 같은 엔드포인트(서버 경유).
    rerouteInFlightRef.current = true;
    lastRerouteAtRef.current = now;
    offRouteHitsRef.current = 0;
    const ac = new AbortController();
    rerouteAbortRef.current = ac;
    const dest = routePlan.to;
    const reqProduct = routePlan.product;
    const q = new URLSearchParams({
      fromLat: String(lat), fromLng: String(lng),
      toLat: String(dest.lat), toLng: String(dest.lng),
      product: reqProduct, buffer: '2000', limit: '10',
    });
    fetch(`/api/route-cheapest?${q}`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`route-cheapest ${r.status}`);
        return r.json();
      })
      .then((j) => {
        // 사용자가 그새 ✕로 종료했으면 갱신하지 않는다.
        if (!useMapStore.getState().routePlan) return;
        const newStations: StationWithPrice[] = Array.isArray(j?.stations) ? j.stations : [];
        if (newStations.length === 0) return; // 주변 주유소 없으면 기존 경로 유지
        const newPath = Array.isArray(j?.path) && j.path.length >= 2
          ? j.path
          : [{ lat, lng }, { lat: dest.lat, lng: dest.lng }];
        setRoutePlan({
          from: { lat, lng, name: '내 위치' },
          to: dest,
          product: reqProduct,
          stations: newStations,
          path: newPath,
        });
        setRerouteToast(true);
        window.setTimeout(() => setRerouteToast(false), 2500);
      })
      .catch((e) => {
        // 실패(취소/네트워크/할당량) 시 기존 경로 유지 — 앱 안 깨짐.
        if (e.name !== 'AbortError') console.error('reroute fail', e);
      })
      .finally(() => {
        rerouteInFlightRef.current = false;
        if (rerouteAbortRef.current === ac) rerouteAbortRef.current = null;
      });
    // 위경도 변화에만 반응(거리 계산은 가벼움). product/destination은 routePlan 식별로 포함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.coords?.lat, geo.coords?.lng, routePlan, layer, setRoutePlan]);

  // 충전소 정렬/거리 기준 좌표: 내 위치 우선, 없으면 화면 중심(마지막 bounds 중심)으로 폴백.
  // (위치 없으면 거리는 화면 중심 기준 — 정렬은 사용가능→급속→거리, 거리 폴백은 합리적 근사)
  const evOrigin = useMemo(() => {
    if (myLocation) return { lat: myLocation.lat, lng: myLocation.lng };
    const b = lastBoundsRef.current;
    if (b) return { lat: (b.swLat + b.neLat) / 2, lng: (b.swLng + b.neLng) / 2 };
    return null;
    // lastBoundsRef는 ref라 의존성에 못 들어가므로, 영역 이동으로 evStations가 바뀌면
    // 화면중심 폴백을 다시 계산하도록 evStations를 게이트로 둔다(의도된 의존성).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation, evStations]);

  // === 주유소 체류 감지(지오펜스 + dwell) ===
  // 포그라운드 + GPS 추적 중에만 동작(웹 한계: 백그라운드 감지 불가, 정상).
  // 조건: 로그인 + gas 레이어 + 경로 모드 아님(경로 알림과 UI/맥락 충돌 방지) + 이미 팝업 떠있지 않음.
  // 50m 진입→2분 체류→이탈 시 onDetect로 팝업 표시(같은 주유소 2시간 억제는 훅 내부에서 처리).
  const dwellEnabled =
    authStatus === 'authenticated' && layer === 'gas' && !routePlan && !dwellStation;
  const handleDwellDetect = useCallback((s: DwellStation) => {
    setDwellStation(s);
  }, []);
  useFuelDwellDetect(geo.coords ?? null, dwellEnabled, handleDwellDetect);

  return (
    // 바깥 래퍼: 세로 스크롤 가능. 첫 뷰포트(헤더+필터바+지도)는 한 화면(h-dvh)을 채우고,
    // 그 아래로 스크롤하면 사업자 정보 푸터가 나온다(카드사 심사: 메인 하단 사업자 정보).
    <div className="h-dvh overflow-y-auto">
      {/* 첫 화면: 기존 전체화면 지도 UX 유지. 지도 영역(map-container)은 한 화면을 채운다.
          내부 absolute 요소(GPS/배너/시트/알람/전체화면)는 모두 이 묶음 내부 기준이라 동작 불변. */}
      <div className="relative flex h-dvh flex-col">
        <ProductSync />
        <Header />
        <FilterBar />

        {/* 경로 모드 표시줄 — routePlan이 있을 때 필터바 바로 아래(정상 흐름)에 컴팩트하게 노출.
            지도 영역 밖이라 마커/하단 GPS 버튼과 겹치지 않는다. 왼쪽: 출발→도착·최저가 N곳(한 줄 말줄임),
            오른쪽: 닫기(✕)로 경로 해제. */}
        {layer === 'gas' && routePlan && (
          <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-1.5 dark:border-gray-800 dark:bg-gray-900">
            <span className="shrink-0 text-sm">🛣️</span>
            <div className="min-w-0 flex-1 truncate text-xs">
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {routePlan.from.name ?? '출발'} → {routePlan.to.name ?? '도착'}
              </span>
              <span className="ml-1.5 text-gray-500 dark:text-gray-400">
                · 최저가 {routePlan.stations.length}곳
              </span>
            </div>
            <button
              onClick={() => clearRoutePlan()}
              aria-label="경로 표시 해제"
              title="경로 표시 해제"
              className="shrink-0 rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* overflow-hidden: 접힘 시 시트 본체가 translate-y로 컨테이너 하단(=첫 화면 경계) 밖으로
            삐져나가 그 아래 사업자 정보 푸터를 가리는 것을 막는다. 시트는 이 컨테이너(relative) 기준
            absolute bottom-0이라 경계에서 클립되어 접힘 시 SHEET_PEEK_PX(96px) peek만 남는다. 펼침 상태(translate-y-0,
            ≤70vh)는 컨테이너 내부에 들어와 클립되지 않고, GPS/전체화면/알람/배너 등 다른 absolute 요소도
            모두 컨테이너 내부 좌표라 영향받지 않는다. */}
        <div ref={mapContainerRef} className="map-container min-h-0 flex-1 overflow-hidden">
        <KakaoMap
          initialCenter={restoredView ? { lat: restoredView.lat, lng: restoredView.lng } : undefined}
          initialLevel={restoredView?.level}
          suppressAutoCenter={!!restoredView}
          stations={visibleStations}
          allStations={visibleAllStations}
          nationalTop10={visibleNationalTop10}
          nearbyTop10={visibleNearbyTop10}
          nearbyStations={visibleNearbyStations}
          expOnly={expOnly}
          expStations={expStations}
          activeTab={activeTab}
          product={product}
          layer={layer}
          evStations={evStations}
          onEvMarkerClick={(s) => {
            if (isDesktop) setEvPopup(s);
            else router.push(`/ev/${encodeURIComponent(s.statId)}`);
          }}
          routePlan={layer === 'gas' ? routePlan : null}
          onRouteStationClick={handleMarkerClick}
          // RouteAlert 배너가 떠 있는 그 주유소만 지도에서 강하게 강조(주황 펄스 + bounce).
          // 배너가 닫히거나(routeAlert=null) 대상이 바뀌면 강조도 따라 갱신된다.
          highlightStationId={layer === 'gas' && routePlan && routeAlert ? routeAlert.station.id : null}
          myLocation={myLocation}
          heading={geo.coords?.heading ?? null}
          recenterSignal={recenterSignal}
          follow={follow}
          onBoundsChange={(b) => {
            lastBoundsRef.current = b;
            // 활성 레이어에 맞는 데이터만 조회(불필요 호출/캐시 오염 방지).
            if (layer === 'ev') fetchEvStations(b);
            else { fetchStations(b); fetchAllStations(b); }
          }}
          onViewChange={(v) => {
            setLastView(v);
            // ④ 추세 배너 폴백 좌표 — 지도 중심을 추적(GPS 좌표가 없을 때 사용).
            setMapCenter({ lat: v.lat, lng: v.lng });
          }}
          onUserPan={() => setFollow(false)}
          onMarkerClick={handleMarkerClick}
        />

        {/* 내 위치 / 따라가기 버튼 — 누르면 따라가기 ON(위치 자동 추적), 다시 누르면 즉시 내 위치로 재이동 */}
        <button
          onClick={() => {
            // 내 위치 이동/따라가기는 비회원도 사용 가능(가입 전 가치 체험).
            // 위치 권한은 브라우저 단에서 처리되므로 로그인 불필요.
            setGeoEnabled(true);
            geo.request();
            // 따라가기 모드 ON: 이후 위치 갱신마다 지도가 내 위치를 따라간다.
            setFollow(true);
            // 이미 위치를 알고 있으면 즉시 그 위치로 이동(재클릭).
            // 아직 모르면 대기 플래그를 켜서 첫 좌표 획득 시 이동시킨다
            // (복원 모드에선 자동 센터링이 꺼져 있으므로 이 경로로 이동을 보장).
            if (geo.coords) setRecenterSignal((n) => n + 1);
            else pendingRecenterRef.current = true;
          }}
          // 우측 하단 고정(접힘 상태 기준). 시트 펼침 시에는 fade-out + 클릭 차단으로 숨긴다(시트 뒤로 가려짐).
          style={gpsPosition}
          aria-hidden={sheetOpen}
          tabIndex={sheetOpen ? -1 : undefined}
          className={`absolute right-3 z-30 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-lg text-gray-700 transition-opacity duration-300 hover:opacity-90 dark:text-gray-200 ${
            sheetOpen ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          aria-label={follow ? '따라가기 모드 켜짐 — 내 위치 추적 중' : '내 위치로 이동'}
          aria-pressed={follow}
          title={
            geo.status === 'denied'
              ? '위치 권한이 차단되었습니다. 브라우저 설정에서 허용해주세요.'
              : geo.error
                ?? (follow ? '내 위치 따라가는 중 (지도를 움직이면 해제)' : '내 위치로 이동 / 따라가기')
          }
        >
          {geo.status === 'denied'
            ? '🚫'
            : geo.status === 'locating'
              ? '⏳'
              : (
                // 따라가기 ON/OFF 모두 같은 아이콘(icon_gps.png)을 쓴다.
                // ON(선택): 원본 컬러. OFF(비선택): CSS grayscale로 회색 처리해 "비활성" 느낌.
                // 아이콘 PNG에 배경이 baked-in 되어 있어, 둥근 버튼처럼 보이도록
                // overflow-hidden + 버튼 크기를 꽉 채우는(cover) 방식으로 정사각 이미지를 원형 클립한다.
                <Image
                  src="/icons/icon_gps.png"
                  alt={follow ? '따라가기 모드 켜짐' : '내 위치'}
                  width={44}
                  height={44}
                  className={`h-full w-full object-cover transition ${
                    follow ? '' : 'opacity-70 grayscale'
                  }`}
                />
              )}
        </button>

        {/* 지도 색상 안내(ⓘ) — 지도 우측 상단. 테두리·배경 없이 아이콘만.
            전체화면 버튼(right-3)이 있으면 그 왼쪽으로 비켜 배치(겹침 방지). */}
        <button
          onClick={() => setLegendOpen((v) => !v)}
          aria-label="지도 색상 안내"
          aria-expanded={legendOpen}
          title="지도 색상 안내"
          style={{ top: '12px', right: fullscreen.supported ? '60px' : '12px' }}
          className="absolute z-30 flex h-11 w-11 items-center justify-center text-gray-600 transition hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 drop-shadow" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="9.5" />
            <path strokeLinecap="round" d="M12 11v5" />
            <circle cx="12" cy="7.8" r="0.1" strokeWidth={2.6} />
          </svg>
        </button>

        {legendOpen && <MarkerLegend onClose={() => setLegendOpen(false)} />}

        {/* PWA 설치 안내 배너 — 한 번 닫으면 다시 뜨지 않는다. 설치됨/불가 환경에선 미노출. */}
        <InstallBanner />

        {/* 전체화면 토글 — 지원 브라우저에서만 노출(iOS Safari 등 미지원 시 숨김).
            우측 상단(필터바 아래)에 고정해 GPS 버튼(우측 하단)과 겹치지 않게 둔다. */}
        {fullscreen.supported && (
          <button
            onClick={fullscreen.toggle}
            style={{ top: '12px' }}
            className="absolute right-3 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-lg text-gray-700 shadow-md backdrop-blur transition hover:bg-white dark:bg-gray-800/90 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label={fullscreen.isFullscreen ? '전체화면 종료' : '전체화면'}
            aria-pressed={fullscreen.isFullscreen}
            title={fullscreen.isFullscreen ? '전체화면 종료' : '전체화면으로 보기'}
          >
            {fullscreen.isFullscreen ? '🗗' : '⛶'}
          </button>
        )}

        {/* 1km 알람 — 주유소 레이어에서만(충전소는 가격 알람 대상 아님).
            경로 모드일 때는 경로 표시줄과 겹치므로 내 주변 알람 대신 경로 알림(RouteAlert)을 우선한다. */}
        {layer === 'gas' && !routePlan && alertStation && !alertDismissed && (
          <RadiusAlert
            station={alertStation}
            averagePrice={averagePrice}
            onClick={() => router.push(`/station/${encodeURIComponent(alertStation.id)}`)}
            onDismiss={dismissAlert}
            onNavigate={() => requireAuth(() => setNaviTarget(alertStation))}
          />
        )}

        {/* 경로 주행 중 '경로상 최저가 주유소' 근접 알림 — 1km 이내 접근 시 1회 노출(인앱 팝업 + 효과음).
            경로 표시줄과 같은 상단 위치를 쓰지만, 알림은 z-40으로 그 위에 겹쳐 표시한다. */}
        {layer === 'gas' && routePlan && routeAlert && !routeAlertDismissedRef.current.has(routeAlert.station.id) && (
          <RouteAlert
            station={routeAlert.station}
            distanceM={routeAlert.distanceM}
            onClick={() => router.push(`/station/${encodeURIComponent(routeAlert.station.id)}`)}
            onDismiss={() => {
              // 현재 경로 억제 목록에 누적(요청2). 새 경로로 재탐색 전까지 같은 배너 재노출 안 함.
              routeAlertDismissedRef.current.add(routeAlert.station.id);
              setRouteAlert(null);
            }}
            onNavigate={() => requireAuth(() => setNaviTarget(routeAlert.station))}
          />
        )}

        {/* ④ 가격 추세/타이밍 배너 — 내 지역(현재 위치 또는 지도 중심) 기름값 오름세일 때 노출.
            전체 사용자(비로그인 포함). 1km 알람(RadiusAlert)·경로 알림과 같은 상단 자리를 쓰므로,
            그 둘이 떠 있지 않을 때만(겹침 방지) 노출한다. 컴포넌트 내부에서 추세 미산출/내림세면 스스로 미표시. */}
        {layer === 'gas' && !routePlan && !(alertStation && !alertDismissed) && (
          <PriceTrendBanner
            lat={(myLocation ?? mapCenter)?.lat ?? null}
            lng={(myLocation ?? mapCenter)?.lng ?? null}
            product={product}
          />
        )}

        {/* 경로 이탈 자동 재탐색 안내 토스트 — 짧게 노출(2.5초). 과하지 않게 하단 중앙. */}
        {layer === 'gas' && routePlan && rerouteToast && (
          <div
            role="status"
            className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur dark:bg-gray-100/90 dark:text-gray-900"
          >
            경로를 다시 찾았어요
          </div>
        )}

        {/* 배너 광고 (무료 사용자만 — MVP는 전부 무료).
            시트 펼침 시에는 GPS 버튼과 동일하게 fade-out + 클릭 차단으로 숨긴다. */}
        <BannerAd sheetOpen={sheetOpen} />

        {/* 하단 시트 */}
        <BottomSheet
          stations={visibleStations}
          nearbyStations={visibleNearbyStations}
          nationalTop10Rank={nationalTop10Rank}
          nearbyEnabled={geoEnabled && !!geo.coords}
          nearbyRadiusM={NEARBY_RADIUS_M}
          onSelect={(s) => router.push(`/station/${encodeURIComponent(s.id)}`)}
          onNavigate={(s) => requireAuth(() => setNaviTarget(s))}
          onOpenChange={setSheetOpen}
          onTabChange={handleTabChange}
          layer={layer}
          evStations={evStations}
          evOrigin={evOrigin}
          onSelectEv={(s) => router.push(`/ev/${encodeURIComponent(s.statId)}`)}
          onNavigateEv={(s) =>
            requireAuth(() =>
              setNaviTarget({
                id: s.statId, name: s.name, brand: 'ETC', isSelf: false,
                sido: '01', address: '', lat: s.lat, lng: s.lng,
                product, price: 0, tradeDate: '',
              }),
            )
          }
        />
        </div>
      </div>

      {/* 첫 접속 공지 모달(비로그인·디바이스당 1회) — 회원가입 시 1주일 무료 프리미엄 유도 */}
      {/* 노출 중단(요청에 의해 숨김). 되살리려면 위 import와 이 줄을 함께 복원: <WelcomePromo /> */}

      {/* ④ 주유 타이밍 예측 카드 — 현재 선택 유종(전국) 기준 방향/추천/추이.
          PriceTrendBanner(지도 상단 absolute 오버레이) 아래, 첫 화면(지도) 아래로 스크롤하면 노출되는
          흐름 영역에 둔다(다른 절대배너와 자리 충돌 없이 '아래'에 배치). 신호 없음/비대상 유종이면
          ForecastCard 내부에서 스스로 미표시(graceful). gas 레이어에서만 노출(충전소 무관). */}
      {layer === 'gas' && <ForecastCard product={product} />}

      {/* 메인 하단 사업자 정보 푸터 — 첫 화면(지도) 아래로 스크롤하면 노출(카드사 심사용) */}
      <BusinessFooter />

      {/* PC: 마커 클릭 시 요약 정보 카드 팝업 (모바일은 상세 페이지로 직접 이동) */}
      {popupStation && (
        <StationPopup
          station={popupStation}
          onClose={() => setPopupStation(null)}
          onDetail={() => {
            const id = popupStation.id;
            setPopupStation(null);
            router.push(`/station/${encodeURIComponent(id)}`);
          }}
          onNavigate={() =>
            requireAuth(() => {
              setNaviTarget(popupStation);
              setPopupStation(null);
            })
          }
        />
      )}

      {/* PC: 충전소 마커 클릭 시 요약 정보 카드 팝업 */}
      {evPopup && (
        <EvStationPopup
          station={evPopup}
          onClose={() => setEvPopup(null)}
          onDetail={() => {
            const id = evPopup.statId;
            setEvPopup(null);
            router.push(`/ev/${encodeURIComponent(id)}`);
          }}
          onNavigate={() =>
            requireAuth(() => {
              setNaviTarget({
                id: evPopup.statId, name: evPopup.name, brand: 'ETC', isSelf: false,
                sido: '01', address: '', lat: evPopup.lat, lng: evPopup.lng,
                product, price: 0, tradeDate: '',
              });
              setEvPopup(null);
            })
          }
        />
      )}

      {/* 길안내 확인 모달 → 카카오내비 실행 */}
      {naviTarget && (
        <NaviConfirm
          station={naviTarget}
          origin={myLocation ? { name: '내 위치', lat: myLocation.lat, lng: myLocation.lng } : null}
          onClose={() => setNaviTarget(null)}
        />
      )}

      {/* 주유소 체류 감지 팝업 — "방금 여기서 주유하셨나요?" + 리터/금액 선택 후 저장 */}
      {dwellStation && (
        <FuelDwellPrompt
          stationId={dwellStation.id}
          stationName={dwellStation.name}
          unitPrice={dwellStation.price ?? null}
          onClose={() => setDwellStation(null)}
          onSaved={() => {
            setFuelSavedToast(true);
            window.setTimeout(() => setFuelSavedToast(false), 2500);
          }}
        />
      )}

      {/* 주유 기록 저장 완료 토스트 — 짧게(2.5초) 하단 중앙 */}
      {fuelSavedToast && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-[calc(2rem+env(safe-area-inset-bottom))] left-1/2 z-[70] -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur"
        >
          ⛽ 주유 기록을 저장했어요
        </div>
      )}
    </div>
  );
}
