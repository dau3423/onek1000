'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/ui/Header';
import { FilterBar } from '@/components/ui/FilterBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { BannerAd } from '@/components/ads/BannerAd';
import { RadiusAlert } from '@/components/alert/RadiusAlert';
import { NaviConfirm } from '@/components/alert/NaviConfirm';
import { useMapStore, getInitialMapView, type MapView } from '@/stores/map';
import { useGeolocation } from '@/hooks/useGeolocation';
import { quantize } from '@/lib/map/geo';
import type { BboxResponse, RadiusResponse, StationWithPrice } from '@/types/station';

// KakaoMap은 window 의존 + SDK 외부 스크립트라 SSR 비활성
const KakaoMap = dynamic(
  () => import('@/components/map/KakaoMap').then((m) => m.KakaoMap),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-gray-500">지도 로딩 중...</div> },
);

const ALERT_THRESHOLD = 50; // 평균 대비 -50원 이상 저렴할 때 알람
const ALERT_RADIUS_M = 1000; // 알람 판정 반경 (FR-2.3)
const NEARBY_RADIUS_M = 5000; // '내 주변' 표시 반경 (데이터 희소성 고려)
const NEARBY_LIMIT = 20; // 반경 응답 최대 개수 (5km TOP10 + 1km 알람 산출에 충분)

export default function HomePage() {
  const router = useRouter();
  const { product, selfOnly, alertDismissed, dismissAlert, resetAlert, setLastView } = useMapStore();

  // 마운트 시점에 1회 고정: 직전에 보던 지도 시점(상세 왕복/새로고침 복원).
  // 있으면 그 시점을 초기값으로 쓰고, 자동 위치 센터링을 억제한다.
  const [restoredView] = useState<MapView | null>(() => getInitialMapView());

  // 지도 영역 (bbox) 내 주유소
  const [stations, setStations] = useState<StationWithPrice[]>([]);
  const [averagePrice, setAveragePrice] = useState(1600);
  const lastBoundsRef = useRef<{ swLat: number; swLng: number; neLat: number; neLng: number; zoom: number } | null>(null);
  const bboxAbort = useRef<AbortController | null>(null);

  // 위치 기반 반경 조회 (내 주변 TOP10 + 1km 알람)
  const [geoEnabled, setGeoEnabled] = useState(false);
  const geo = useGeolocation(geoEnabled);

  // 첫 신규 진입 시 자동으로 위치 추적 시작 (FR-2.1).
  // 복원된 시점(restoredView)이 있으면 = 상세에서 돌아왔거나 새로고침한 경우이므로
  // 자동 요청하지 않고 복원 시점을 유지한다(사용자가 보던 위치 우선).
  useEffect(() => {
    if (restoredView) return;
    setGeoEnabled(true);
    // 권한 허용 시 watchPosition 시작 → 첫 위치 획득에서 KakaoMap이 자동 센터링.
    // 거부/미지원이면 기존처럼 서울시청 기본 화면 유지, 버튼으로 재시도.
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

  // bbox 변경 시 stations 조회
  useEffect(() => {
    const b = lastBoundsRef.current;
    if (!b) return;
    fetchStations(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const filtered = selfOnly ? list.filter((s) => s.isSelf) : list;
        setStations(filtered);
        if (filtered.length) {
          const avg = Math.round(filtered.reduce((s, x) => s + x.price, 0) / filtered.length);
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
    <div className="relative flex h-dvh flex-col">
      <Header />
      <FilterBar />

      <div className="map-container flex-1">
        <KakaoMap
          initialCenter={restoredView ? { lat: restoredView.lat, lng: restoredView.lng } : undefined}
          initialLevel={restoredView?.level}
          suppressAutoCenter={!!restoredView}
          stations={stations}
          averagePrice={averagePrice}
          myLocation={myLocation}
          recenterSignal={recenterSignal}
          follow={follow}
          onBoundsChange={(b) => {
            lastBoundsRef.current = b;
            fetchStations(b);
          }}
          onViewChange={setLastView}
          onUserPan={() => setFollow(false)}
          onMarkerClick={(s) => router.push(`/station/${s.id}`)}
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
          className={`absolute right-3 top-[calc(56px+44px+12px+env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full text-lg shadow-md transition-colors ${
            follow && geo.status !== 'denied'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
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
              : follow ? '🧭' : '📍'}
        </button>

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
          stations={stations}
          averagePrice={averagePrice}
          nearbyStations={radiusStations}
          nearbyEnabled={geoEnabled && !!geo.coords}
          nearbyRadiusM={NEARBY_RADIUS_M}
          onSelect={(s) => router.push(`/station/${s.id}`)}
          onNavigate={(s) => setNaviTarget(s)}
        />
      </div>

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
