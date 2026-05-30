'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/ui/Header';
import { FilterBar } from '@/components/ui/FilterBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { BannerAd } from '@/components/ads/BannerAd';
import { RadiusAlert } from '@/components/alert/RadiusAlert';
import { useMapStore } from '@/stores/map';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { BboxResponse, RadiusResponse, StationWithPrice } from '@/types/station';

// KakaoMap은 window 의존 + SDK 외부 스크립트라 SSR 비활성
const KakaoMap = dynamic(
  () => import('@/components/map/KakaoMap').then((m) => m.KakaoMap),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-gray-500">지도 로딩 중...</div> },
);

const ALERT_THRESHOLD = 50; // 평균 대비 -50원 이상 저렴할 때 알람

export default function HomePage() {
  const router = useRouter();
  const { product, selfOnly, alertDismissed, dismissAlert, resetAlert } = useMapStore();

  // 지도 영역 (bbox) 내 주유소
  const [stations, setStations] = useState<StationWithPrice[]>([]);
  const [averagePrice, setAveragePrice] = useState(1600);
  const lastBoundsRef = useRef<{ swLat: number; swLng: number; neLat: number; neLng: number; zoom: number } | null>(null);
  const bboxAbort = useRef<AbortController | null>(null);

  // 위치 기반 1km 알람
  const [geoEnabled, setGeoEnabled] = useState(false);
  const geo = useGeolocation(geoEnabled);
  const [radiusStations, setRadiusStations] = useState<StationWithPrice[]>([]);
  const [radiusAvg, setRadiusAvg] = useState<number>(1600);
  // 값이 바뀌면 지도가 내 위치로 이동 (버튼 재클릭마다 증가)
  const [recenterSignal, setRecenterSignal] = useState(0);

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

  // 내 위치 변경 시 radius 조회
  useEffect(() => {
    if (!geo.coords) return;
    const params = new URLSearchParams({
      lat: String(geo.coords.lat), lng: String(geo.coords.lng),
      r: '1000', product,
    });
    fetch(`/api/stations/radius?${params}`)
      .then((r) => r.json() as Promise<RadiusResponse>)
      .then((data) => {
        setRadiusStations(data.stations);
        if (data.averagePrice) setRadiusAvg(data.averagePrice);
        resetAlert();
      })
      .catch(console.error);
  }, [geo.coords?.lat, geo.coords?.lng, product, resetAlert]);

  // 알람 대상: 평균 대비 ALERT_THRESHOLD 이상 싼 1km 내 최저가
  const alertStation = useMemo(() => {
    if (!radiusStations.length) return null;
    const cheapest = radiusStations[0];
    return averagePrice - cheapest.price >= ALERT_THRESHOLD ? cheapest : null;
  }, [radiusStations, averagePrice]);

  const myLocation = geo.coords ?? null;

  return (
    <div className="relative flex h-dvh flex-col">
      <Header />
      <FilterBar />

      <div className="map-container flex-1">
        <KakaoMap
          stations={stations}
          averagePrice={averagePrice}
          myLocation={myLocation}
          recenterSignal={recenterSignal}
          onBoundsChange={(b) => {
            lastBoundsRef.current = b;
            fetchStations(b);
          }}
          onMarkerClick={(s) => router.push(`/station/${s.id}`)}
        />

        {/* 내 위치 버튼 */}
        <button
          onClick={() => {
            setGeoEnabled(true);
            geo.request();
            // 이미 위치를 알고 있으면 즉시 그 위치로 이동(재클릭). 아직 모르면
            // 첫 위치 획득 시 KakaoMap이 자동으로 중심을 이동한다.
            if (geo.coords) setRecenterSignal((n) => n + 1);
          }}
          className="absolute right-3 top-[calc(56px+44px+12px+env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg shadow-md hover:bg-gray-50"
          aria-label="내 위치"
          title={
            geo.status === 'denied'
              ? '위치 권한이 차단되었습니다. 브라우저 설정에서 허용해주세요.'
              : geo.error ?? '내 위치로 이동'
          }
        >
          {geo.status === 'denied' ? '🚫' : geo.status === 'locating' ? '⏳' : '📍'}
        </button>

        {/* 1km 알람 */}
        {alertStation && !alertDismissed && (
          <RadiusAlert
            station={alertStation}
            averagePrice={averagePrice}
            onClick={() => router.push(`/station/${alertStation.id}`)}
            onDismiss={dismissAlert}
          />
        )}

        {/* 배너 광고 (무료 사용자만 — MVP는 전부 무료) */}
        <BannerAd />

        {/* 하단 시트 */}
        <BottomSheet
          stations={stations}
          averagePrice={averagePrice}
          onSelect={(s) => router.push(`/station/${s.id}`)}
        />
      </div>
    </div>
  );
}
