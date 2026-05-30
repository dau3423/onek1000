'use client';

import { useEffect, useRef, useState } from 'react';
import { loadKakao } from './loadKakao';
import type { StationWithPrice, ProductCode } from '@/types/station';
import { BRAND_COLOR } from '@/types/station';
import { priceTier, topPriceRankMap } from '@/lib/map/geo';

interface Props {
  initialCenter?: { lat: number; lng: number };
  initialLevel?: number;          // 카카오 level: 작을수록 확대 (1~14)
  myLocation?: { lat: number; lng: number } | null;
  /** 값이 바뀔 때마다 내 위치로 지도 중심 이동 (버튼 재클릭 대응). 0이면 이동 안 함. */
  recenterSignal?: number;
  /** true면 첫 위치 획득 시 자동 중심 이동을 하지 않는다(복원된 시점을 우선). */
  suppressAutoCenter?: boolean;
  /** 따라가기 모드. true면 myLocation 갱신 시마다 지도 중심을 내 위치로 자동 이동(panTo). */
  follow?: boolean;
  stations: StationWithPrice[];
  averagePrice?: number;
  onBoundsChange?: (b: {
    swLat: number; swLng: number; neLat: number; neLng: number; zoom: number;
  }) => void;
  /** 패닝/줌이 안정될 때 현재 지도 중심/level 전달 (마지막 시점 저장용). */
  onViewChange?: (v: { lat: number; lng: number; level: number }) => void;
  /** 사용자가 지도를 직접 드래그(팬)했을 때 호출 (따라가기 모드 해제 트리거). */
  onUserPan?: () => void;
  onMarkerClick?: (s: StationWithPrice) => void;
}

export function KakaoMap({
  initialCenter = { lat: 37.5663, lng: 126.9779 }, // 서울시청
  initialLevel = 5,
  myLocation,
  recenterSignal = 0,
  suppressAutoCenter = false,
  follow = false,
  stations,
  averagePrice = 1600,
  onBoundsChange,
  onViewChange,
  onUserPan,
  onMarkerClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const myOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const myCircleRef = useRef<kakao.maps.Circle | null>(null);
  // 첫 위치 획득 시 1회 자동 중심 이동 했는지 여부 (이후 watchPosition 갱신엔 패닝하지 않음)
  // 복원된 시점이 있으면(suppressAutoCenter) 처음부터 true로 두어 자동 센터링을 막는다.
  const didAutoCenterRef = useRef(suppressAutoCenter);
  // onBoundsChange/onViewChange는 부모에서 매번 새 함수가 들어올 수 있으므로 ref로 최신값 유지
  const onBoundsChangeRef = useRef(onBoundsChange);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => { onViewChangeRef.current = onViewChange; }, [onViewChange]);
  const onUserPanRef = useRef(onUserPan);
  useEffect(() => { onUserPanRef.current = onUserPan; }, [onUserPan]);
  // 따라가기 모드 최신값 — 초기화 effect의 dragstart 리스너에서 참조
  const followRef = useRef(follow);
  useEffect(() => { followRef.current = follow; }, [follow]);
  // 프로그램적 panTo(따라가기/recenter)로 인한 이동을 사용자 드래그와 구분하기 위한 플래그.
  // panTo는 보통 dragstart를 발생시키지 않지만, 만일을 대비한 안전장치.
  const programmaticMoveRef = useRef(false);
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

        // 사용자가 지도를 직접 드래그하면 따라가기 모드 해제 트리거.
        // 프로그램적 panTo는 dragstart를 발생시키지 않지만, 플래그로 한 번 더 방어한다.
        window.kakao.maps.event.addListener(map, 'dragstart', () => {
          if (programmaticMoveRef.current) return;
          if (followRef.current) onUserPanRef.current?.();
        });
      })
      .catch((e) => setError(e.message));
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emitBounds() {
    const map = mapRef.current;
    if (!map) return;

    // 현재 중심/level을 마지막 시점으로 저장 (상세 왕복 시 복원용)
    const center = map.getCenter();
    onViewChangeRef.current?.({
      lat: center.getLat(), lng: center.getLng(), level: map.getLevel(),
    });

    const fn = onBoundsChangeRef.current;
    if (!fn) return;
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
    // 현재 표시 집합 기준 최저가 TOP10 강조 (FR-1.2/1.4): id → 순위(1~10)
    const top10Rank = topPriceRankMap(stations, 10);
    const HL_COLOR = '#F59E0B';   // 강조색(앰버) — tier 색과 구분되는 톤
    const HL_RING = '#B45309';    // 강조 테두리(진한 앰버)

    // 순위 단서(색맹 대비: 색 외 형태/문자로도 구분).
    // 1~3위는 메달 이모지, 4~10위는 깃발 + 숫자. 모든 줌에서 동일한 단서 사용.
    const rankMedal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '');
    // TOP10 핀(물방울) 모양 마커 SVG — 일반 원형 마커와 형태부터 확연히 구분.
    // size: 핀 전체 높이(px). 순위 메달/숫자를 핀 원형 머리 안에 배치.
    const topPinSvg = (rank: number, size: number) => {
      const w = Math.round(size * 0.72);
      const medal = rankMedal(rank);
      const headR = w * 0.5;
      // 핀 머리(원) 안 표시: 1~3위 메달 이모지, 4위 이하 순위 숫자
      const inner = medal
        ? `<text x="${headR}" y="${headR * 1.05}" text-anchor="middle" dominant-baseline="central" font-size="${headR * 1.1}">${medal}</text>`
        : `<text x="${headR}" y="${headR}" text-anchor="middle" dominant-baseline="central" font-size="${headR}" font-weight="800" fill="#fff">${rank}</text>`;
      // 물방울 경로: 위쪽 원 + 아래로 뾰족한 꼬리
      return `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
        <path d="M${headR} ${size} C${headR * 0.15} ${size * 0.62} 0 ${headR * 1.25} 0 ${headR} a${headR} ${headR} 0 1 1 ${w} 0 C${w} ${headR * 1.25} ${headR * 1.85} ${size * 0.62} ${headR} ${size} Z" fill="${HL_COLOR}" stroke="${HL_RING}" stroke-width="2"/>
        <circle cx="${headR}" cy="${headR}" r="${headR * 0.78}" fill="${HL_RING}" opacity="0.18"/>
        ${inner}
      </svg>`;
    };

    for (const s of stations) {
      const rank = top10Rank.get(s.id);      // TOP10이면 1~10, 아니면 undefined
      const isTop = rank !== undefined;
      const tier = priceTier(s.price, averagePrice);
      const tierColor = tier === 'cheap' ? '#16A34A' : tier === 'expensive' ? '#DC2626' : '#EAB308';
      const brandColor = BRAND_COLOR[s.brand] ?? '#666';

      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.style.position = 'relative';

      if (isTop) {
        // === TOP10: 물방울 핀 + 순위 메달/숫자 (모든 줌에서 형태로 구분) ===
        // 라벨 줌에서는 가격 라벨을 핀 위에 함께, 축소 줌에서는 핀만 (단, 크게).
        const r = rank as number;
        const pinSize = showLabel ? 38 : 42;  // 축소 줌에서 오히려 더 크게 → 전국에서 눈에 띔
        const pin = topPinSvg(r, pinSize);
        content.innerHTML = showLabel
          ? `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:1px">
            <div style="padding:4px 8px;border-radius:10px;background:${HL_COLOR};color:white;font-size:12px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;border:2px solid ${HL_RING}">
              ₩${s.price.toLocaleString()}
            </div>
            <div style="width:8px;height:8px;background:${HL_COLOR};border-right:2px solid ${HL_RING};border-bottom:2px solid ${HL_RING};transform:rotate(45deg);margin-top:-5px"></div>
            <div style="margin-top:0">${pin}</div>
          </div>`
          : `<div style="position:relative;display:flex;justify-content:center">${pin}</div>`;
      } else {
        // === 일반 마커: 기존 원형 점 유지 ===
        content.innerHTML = showLabel
          ? `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="padding:4px 8px;border-radius:10px;background:${tierColor};color:white;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
              ₩${s.price.toLocaleString()}
            </div>
            <div style="width:8px;height:8px;background:${tierColor};transform:rotate(45deg);margin-top:-4px"></div>
            <div style="width:16px;height:16px;border-radius:50%;background:${brandColor};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);margin-top:-2px"></div>
          </div>`
          : `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center">
            <div style="width:18px;height:18px;border-radius:50%;background:${brandColor};border:3px solid ${tierColor};box-shadow:0 2px 4px rgba(0,0,0,.25)"></div>
          </div>`;
      }

      content.addEventListener('click', () => onMarkerClick?.(s));

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        content,
        yAnchor: 1,
        clickable: true,
        // TOP10 마커는 다른 마커 위에 그려지도록 zIndex 상향 (순위 높을수록 더 위)
        zIndex: isTop ? 10 + (11 - (rank as number)) : 1,
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

    // 첫 위치 획득 시에만 자동으로 내 위치로 중심 이동 (이후 위치 갱신엔 사용자 패닝 방해 X)
    if (!didAutoCenterRef.current) {
      didAutoCenterRef.current = true;
      map.setLevel(4);
      panToProgrammatic(pos);
    } else if (follow) {
      // 따라가기 모드: 위치 갱신마다 줌은 유지한 채 중심만 부드럽게 이동
      panToProgrammatic(pos);
    }
    // follow 변화만으로는 재이동하지 않고 위치 갱신 시점에만 추적 (의도치 않은 이동 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, myLocation]);

  // 내 위치 버튼 재클릭 시(recenterSignal 증가) 명시적으로 내 위치로 이동
  useEffect(() => {
    if (!ready || !mapRef.current || !myLocation || recenterSignal === 0) return;
    const map = mapRef.current;
    map.setLevel(4);
    panToProgrammatic(new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  // 프로그램적 중심 이동 — 따라가기 해제 트리거(dragstart)와 구분하기 위해 플래그를 잠깐 세운다.
  function panToProgrammatic(pos: kakao.maps.LatLng) {
    const map = mapRef.current;
    if (!map) return;
    programmaticMoveRef.current = true;
    map.panTo(pos);
    // panTo 애니메이션 동안 발생할 수 있는 이벤트를 흡수한 뒤 플래그 해제
    window.setTimeout(() => { programmaticMoveRef.current = false; }, 600);
  }

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
