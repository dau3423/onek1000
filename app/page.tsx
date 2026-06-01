'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/ui/Header';
import { FilterBar } from '@/components/ui/FilterBar';
import { BottomSheet, SHEET_PEEK_PX } from '@/components/ui/BottomSheet';
import { BannerAd, BANNER_BOTTOM_PX, BANNER_HEIGHT_PX, useBannerVisible } from '@/components/ads/BannerAd';
import { RadiusAlert } from '@/components/alert/RadiusAlert';
import { NaviConfirm } from '@/components/alert/NaviConfirm';
import { ProductSync } from '@/components/map/ProductSync';
import { StationPopup } from '@/components/map/StationPopup';
import { MarkerLegend } from '@/components/ui/MarkerLegend';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { BusinessFooter } from '@/components/legal/BusinessFooter';
import { useMapStore, getInitialMapView, type MapView } from '@/stores/map';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useFullscreen } from '@/hooks/useFullscreen';
import { quantize } from '@/lib/map/geo';
import type { BboxResponse, RadiusResponse, StationWithPrice, NationalTop10Item, NationalTop10Response } from '@/types/station';

// KakaoMap은 window 의존 + SDK 외부 스크립트라 SSR 비활성
const KakaoMap = dynamic(
  () => import('@/components/map/KakaoMap').then((m) => m.KakaoMap),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-gray-500">지도 로딩 중...</div> },
);

const ALERT_THRESHOLD = 50; // 평균 대비 -50원 이상 저렴할 때 알람
const ALERT_RADIUS_M = 1000; // 알람 판정 반경 (FR-2.3)
const NEARBY_RADIUS_M = 10000; // '내 주변' 표시 반경 (현재 위치 기준 10km)
// 반경 응답 최대 개수. 내 주변 TOP10(가격 정렬) + 1km 알람 산출(거리 기반)을 한 응답에서
// 모두 뽑아내려면 충분히 커야 한다(10km 내 주유소가 많아도 1km 내 최저가가 잘리지 않게).
const NEARBY_LIMIT = 60;
// 지도에 별도 마커로 표시할 '내 주변(10km)' 최저가 상위 개수
const NEARBY_TOP_N = 10;

export default function HomePage() {
  const router = useRouter();
  const { product, brands, alertDismissed, dismissAlert, resetAlert, setLastView } = useMapStore();

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
  // 값이 바뀌면 지도가 내 위치로 이동 (버튼 재클릭마다 증가)
  const [recenterSignal, setRecenterSignal] = useState(0);
  // 버튼을 눌렀지만 아직 좌표를 모를 때, 첫 좌표 획득 시 1회 내 위치로 이동시키기 위한 대기 플래그
  const pendingRecenterRef = useRef(false);
  // 따라가기 모드: ON이면 위치 갱신마다 지도가 내 위치를 자동 추적, 사용자가 지도를 드래그하면 자동 OFF
  const [follow, setFollow] = useState(false);

  // 길안내 확인 모달 대상
  const [naviTarget, setNaviTarget] = useState<StationWithPrice | null>(null);

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
  const gpsPosition: { top?: string; bottom?: string } = bannerVisible
    ? { top: 'auto', bottom: `calc(${BANNER_BOTTOM_PX}px + ${BANNER_HEIGHT_PX}px + ${GPS_BANNER_GAP_PX}px + env(safe-area-inset-bottom))` }
    : { top: 'auto', bottom: `calc(${SHEET_PEEK_PX}px + 12px + env(safe-area-inset-bottom))` };

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
    else router.push(`/station/${s.id}`);
  }

  // 팝업이 열린 채로 뷰포트가 모바일 폭으로 줄면 팝업을 닫는다(분기 일관성).
  useEffect(() => {
    if (!isDesktop && popupStation) setPopupStation(null);
  }, [isDesktop, popupStation]);

  // bbox 변경 시 stations 조회
  useEffect(() => {
    const b = lastBoundsRef.current;
    if (!b) return;
    fetchStations(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  // 유종 변경 시 전국 최저가 TOP10 재조회 (마운트 1회 + product 변경 시).
  // 화면 영역과 무관하므로 bbox 패닝/줌에는 재호출하지 않는다(캐시/rate limit 보호).
  useEffect(() => {
    if (top10Abort.current) top10Abort.current.abort();
    top10Abort.current = new AbortController();
    fetch(`/api/stations/top10?product=${product}`, { signal: top10Abort.current.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`top10 ${r.status}`);
        return (await r.json()) as NationalTop10Response;
      })
      .then((data) => {
        setNationalTop10(Array.isArray(data?.stations) ? data.stations : []);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error('top10 fetch fail', e);
      });
  }, [product]);

  function fetchStations(b: { swLat: number; swLng: number; neLat: number; neLng: number; zoom: number }) {
    if (bboxAbort.current) bboxAbort.current.abort();
    bboxAbort.current = new AbortController();
    const params = new URLSearchParams({
      swLat: String(b.swLat), swLng: String(b.swLng),
      neLat: String(b.neLat), neLng: String(b.neLng),
      zoom: String(b.zoom),
      product,
    });
    fetch(`/api/stations/bbox?${params}`, { signal: bboxAbort.current.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`bbox ${r.status}`);
        return (await r.json()) as BboxResponse;
      })
      .then((data) => {
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
  // 하단 시트 리스트도 동일 브랜드 필터 적용(표시 집합 일관성).
  // averagePrice는 1km 알람 판정(평균-50원) 기준으로 사용한다. 마커 색상은 별도로
  // 화면 표시 집합의 상대 분포(분위수)로 산정한다(KakaoMap/BottomSheet 내부).
  const visibleNearbyStations = useMemo(
    () => (brandSet.size === 0 ? radiusStations : radiusStations.filter((s) => matchBrand(s.brand))),
    [radiusStations, brandSet, matchBrand],
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

        {/* overflow-hidden: 접힘 시 시트 본체가 translate-y로 컨테이너 하단(=첫 화면 경계) 밖으로
            삐져나가 그 아래 사업자 정보 푸터를 가리는 것을 막는다. 시트는 이 컨테이너(relative) 기준
            absolute bottom-0이라 경계에서 클립되어 접힘 시 72px peek만 남는다. 펼침 상태(translate-y-0,
            ≤70vh)는 컨테이너 내부에 들어와 클립되지 않고, GPS/전체화면/알람/배너 등 다른 absolute 요소도
            모두 컨테이너 내부 좌표라 영향받지 않는다. */}
        <div ref={mapContainerRef} className="map-container min-h-0 flex-1 overflow-hidden">
        <KakaoMap
          initialCenter={restoredView ? { lat: restoredView.lat, lng: restoredView.lng } : undefined}
          initialLevel={restoredView?.level}
          suppressAutoCenter={!!restoredView}
          stations={visibleStations}
          nationalTop10={visibleNationalTop10}
          nearbyTop10={visibleNearbyTop10}
          nearbyStations={visibleNearbyStations}
          activeTab={activeTab}
          product={product}
          myLocation={myLocation}
          heading={geo.coords?.heading ?? null}
          recenterSignal={recenterSignal}
          follow={follow}
          onBoundsChange={(b) => {
            lastBoundsRef.current = b;
            fetchStations(b);
          }}
          onViewChange={setLastView}
          onUserPan={() => setFollow(false)}
          onMarkerClick={handleMarkerClick}
        />

        {/* 내 위치 / 따라가기 버튼 — 누르면 따라가기 ON(위치 자동 추적), 다시 누르면 즉시 내 위치로 재이동 */}
        <button
          onClick={() => {
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

        {/* 1km 알람 */}
        {alertStation && !alertDismissed && (
          <RadiusAlert
            station={alertStation}
            averagePrice={averagePrice}
            onClick={() => router.push(`/station/${alertStation.id}`)}
            onDismiss={dismissAlert}
            onNavigate={() => setNaviTarget(alertStation)}
          />
        )}

        {/* 배너 광고 (무료 사용자만 — MVP는 전부 무료) */}
        <BannerAd />

        {/* 하단 시트 */}
        <BottomSheet
          stations={visibleStations}
          nearbyStations={visibleNearbyStations}
          nearbyEnabled={geoEnabled && !!geo.coords}
          nearbyRadiusM={NEARBY_RADIUS_M}
          onSelect={(s) => router.push(`/station/${s.id}`)}
          onNavigate={(s) => setNaviTarget(s)}
          onOpenChange={setSheetOpen}
          onTabChange={handleTabChange}
        />
        </div>
      </div>

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
            router.push(`/station/${id}`);
          }}
          onNavigate={() => {
            setNaviTarget(popupStation);
            setPopupStation(null);
          }}
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
    </div>
  );
}
