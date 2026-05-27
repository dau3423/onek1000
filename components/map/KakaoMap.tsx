'use client';

import { useEffect, useRef, useState } from 'react';
import { loadKakao } from './loadKakao';
import type { StationWithPrice, ProductCode } from '@/types/station';
import { BRAND_COLOR } from '@/types/station';
import { priceTier } from '@/lib/map/geo';

interface Props {
  initialCenter?: { lat: number; lng: number };
  initialLevel?: number;          // 카카오 level: 작을수록 확대 (1~14)
  myLocation?: { lat: number; lng: number } | null;
  stations: StationWithPrice[];
  averagePrice?: number;
  onBoundsChange?: (b: {
    swLat: number; swLng: number; neLat: number; neLng: number; zoom: number;
  }) => void;
  onMarkerClick?: (s: StationWithPrice) => void;
}

export function KakaoMap({
  initialCenter = { lat: 37.5663, lng: 126.9779 }, // 서울시청
  initialLevel = 5,
  myLocation,
  stations,
  averagePrice = 1600,
  onBoundsChange,
  onMarkerClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const myOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const myCircleRef = useRef<kakao.maps.Circle | null>(null);
  // onBoundsChange는 부모에서 매번 새 함수가 들어올 수 있으므로 ref로 최신값 유지
  const onBoundsChangeRef = useRef(onBoundsChange);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SDK 로드 + 지도 초기화
  useEffect(() => {
    let mounted = true;
    loadKakao()
      .then(() => {
        if (!mounted || !containerRef.current) return;
        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(initialCenter.lat, initialCenter.lng),
          level: initialLevel,
        });
        mapRef.current = map;
        setReady(true);
        emitBounds();

        // idle 이벤트 — 패닝/줌 후 안정될 때 발생
        window.kakao.maps.event.addListener(map, 'idle', emitBounds);
      })
      .catch((e) => setError(e.message));
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emitBounds() {
    const map = mapRef.current;
    const fn = onBoundsChangeRef.current;
    if (!map || !fn) return;
    const b = map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    // 카카오 level → "줌 레벨" 매핑 (역수). 카카오 level 1=가장 확대, 14=가장 축소.
    const zoom = 15 - map.getLevel();
    fn({
      swLat: sw.getLat(), swLng: sw.getLng(),
      neLat: ne.getLat(), neLng: ne.getLng(),
      zoom,
    });
  }

  // 주유소 마커 갱신
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 오버레이 제거
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const showLabel = map.getLevel() <= 5; // 줌 인 상태에서만 가격 라벨
    for (const s of stations) {
      const tier = priceTier(s.price, averagePrice);
      const tierColor = tier === 'cheap' ? '#16A34A' : tier === 'expensive' ? '#DC2626' : '#EAB308';
      const brandColor = BRAND_COLOR[s.brand] ?? '#666';

      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.innerHTML = showLabel
        ? `
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="padding:4px 8px;border-radius:10px;background:${tierColor};color:white;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
              ₩${s.price.toLocaleString()}
            </div>
            <div style="width:8px;height:8px;background:${tierColor};transform:rotate(45deg);margin-top:-4px"></div>
            <div style="width:16px;height:16px;border-radius:50%;background:${brandColor};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);margin-top:-2px"></div>
          </div>`
        : `
          <div style="display:flex;flex-direction:column;align-items:center">
            <div style="width:18px;height:18px;border-radius:50%;background:${brandColor};border:3px solid ${tierColor};box-shadow:0 2px 4px rgba(0,0,0,.25)"></div>
          </div>`;

      content.addEventListener('click', () => onMarkerClick?.(s));

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        content,
        yAnchor: 1,
        clickable: true,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }
  }, [ready, stations, averagePrice, onMarkerClick]);

  // 내 위치 마커 + 1km 원
  useEffect(() => {
    if (!ready || !mapRef.current || !myLocation) return;
    const map = mapRef.current;
    const pos = new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng);

    if (myOverlayRef.current) myOverlayRef.current.setMap(null);
    if (myCircleRef.current) myCircleRef.current.setMap(null);

    const dot = document.createElement('div');
    dot.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#1d4ed8;border:3px solid white;box-shadow:0 0 0 4px rgba(29,78,216,.25)';
    const overlay = new window.kakao.maps.CustomOverlay({
      position: pos, content: dot, yAnchor: 0.5, xAnchor: 0.5, zIndex: 5,
    });
    overlay.setMap(map);
    myOverlayRef.current = overlay;

    myCircleRef.current = new window.kakao.maps.Circle({
      center: pos, radius: 1000,
      strokeWeight: 1, strokeColor: '#1d4ed8', strokeOpacity: 0.6, strokeStyle: 'dash',
      fillColor: '#1d4ed8', fillOpacity: 0.06,
    });
    myCircleRef.current.setMap(map);
  }, [ready, myLocation]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-6 text-center">
        <div>
          <p className="font-semibold text-red-600">지도를 불러오지 못했습니다.</p>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <p className="mt-4 text-xs text-gray-500">
            <code>.env.local</code>에 <code>NEXT_PUBLIC_KAKAO_MAP_KEY</code>를 설정하고
            카카오 디벨로퍼스에서 도메인을 등록했는지 확인해주세요.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
