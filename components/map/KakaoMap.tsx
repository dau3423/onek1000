'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadKakao } from './loadKakao';
import type { StationWithPrice, NationalTop10Item, ProductCode } from '@/types/station';
import { BRAND_COLOR } from '@/types/station';
import { priceTier, priceTierThresholds } from '@/lib/map/geo';

// === 전국 TOP10 강조 마커 디자인 상수/헬퍼 (일반 마커와 형태부터 구분) ===
// 색 역할은 일반 마커와 통일: 본체(안쪽)=가격 tier 색, 테두리=브랜드 색.
// "전국 TOP10" 카테고리는 물방울 핀 형태 + 메달/순위로 구분하고,
// 가격 라벨 말풍선 테두리에 앰버(HL_COLOR)를 보조 단서로 남겨 카테고리 식별을 보강한다.
const HL_COLOR = '#F59E0B'; // 전국 카테고리 보조색(앰버) — 가격 라벨 말풍선 강조에 사용
const HL_RING = '#B45309';  // 전국 카테고리 보조 테두리(진한 앰버)

// === 내 주변(10km) TOP10 강조 마커 디자인 상수 ===
// 색 역할 통일: 배지 본체(안쪽)=가격 tier 색, 테두리=브랜드 색.
// "내 주변" 카테고리는 원형 배지(+아래 꼬리) 형태 + 순위로 구분하고,
// 가격 라벨 말풍선에 블루(NEAR_COLOR)를 보조 단서로 남긴다(내 위치 파란 점과 톤 연계).
// 전국 메달(물방울 핀)과는 형태(원형 배지)로 구분.
const NEAR_COLOR = '#2563EB'; // 내 주변 카테고리 보조색(블루) — 가격 라벨 말풍선 강조에 사용
const NEAR_RING = '#1D4ED8';  // 내 주변 카테고리 보조 테두리(진한 블루)

// 내 위치로 자동 줌인할 카카오 level (zoom = 15 - level). level 6 = zoom 9(시군구 단위).
// 내 지역 주유소가 화면에 여러 개 들어와 bbox 최저가가 자연히 보이는 수준.
const MY_AREA_LEVEL = 6;

// 순위 단서(색맹 대비: 색 외 형태/문자로도 구분). 1~3위는 메달 이모지, 4~10위는 숫자.
const rankMedal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '');

// 배경(브랜드 색) 위 텍스트 대비 — 밝은 배경(예: S-OIL 노랑)에는 검정, 어두운 배경엔 흰색.
// hex(#RRGGBB) → 상대 휘도 근사. 마커가 많아도 비용이 미미한 단순 계산.
function readableText(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#fff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // 표준 가중 휘도(0~255). 0.6 이상이면 밝은 색으로 보고 검정 텍스트.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1f2937' : '#fff';
}

// TOP10 핀(물방울) 모양 마커 SVG — 일반 원형 마커와 형태부터 확연히 구분.
// 색 역할 통일: 본체 채움=가격 tier 색(tierColor), 테두리=브랜드 색(brandColor).
// 순위 메달/숫자는 핀 원형 머리 안에 배치하고, 텍스트색은 본체(tier 색) 대비에 맞춘다.
// size: 핀 전체 높이(px).
function topPinSvg(rank: number, size: number, tierColor: string, brandColor: string) {
  const w = Math.round(size * 0.72);
  const medal = rankMedal(rank);
  const headR = w * 0.5;
  const txt = readableText(tierColor);
  // 핀 머리(원) 안 표시: 1~3위 메달 이모지, 4위 이하 순위 숫자(tier 색 대비 텍스트색)
  const inner = medal
    ? `<text x="${headR}" y="${headR * 1.05}" text-anchor="middle" dominant-baseline="central" font-size="${headR * 1.1}">${medal}</text>`
    : `<text x="${headR}" y="${headR}" text-anchor="middle" dominant-baseline="central" font-size="${headR}" font-weight="800" fill="${txt}">${rank}</text>`;
  // 물방울 경로: 위쪽 원 + 아래로 뾰족한 꼬리. 본체=tier 색, 테두리=브랜드 색.
  return `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="M${headR} ${size} C${headR * 0.15} ${size * 0.62} 0 ${headR * 1.25} 0 ${headR} a${headR} ${headR} 0 1 1 ${w} 0 C${w} ${headR * 1.25} ${headR * 1.85} ${size * 0.62} ${headR} ${size} Z" fill="${tierColor}" stroke="${brandColor}" stroke-width="3"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.82}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1"/>
    ${inner}
  </svg>`;
}

interface Props {
  initialCenter?: { lat: number; lng: number };
  initialLevel?: number;          // 카카오 level: 작을수록 확대 (1~14)
  myLocation?: { lat: number; lng: number } | null;
  /**
   * 진행 방향(0~360°, 북=0 시계방향). null이면 방향 정보 없음(정지/미지원).
   * 내 위치 마커를 이 각도로 회전한 화살표로 표시한다. 카카오맵 웹 SDK는 지도
   * 회전을 지원하지 않으므로 지도는 북쪽 고정, 마커만 회전한다.
   */
  heading?: number | null;
  /** 값이 바뀔 때마다 내 위치로 지도 중심 이동 (버튼 재클릭 대응). 0이면 이동 안 함. */
  recenterSignal?: number;
  /** true면 첫 위치 획득 시 자동 중심 이동을 하지 않는다(복원된 시점을 우선). */
  suppressAutoCenter?: boolean;
  /** 따라가기 모드. true면 myLocation 갱신 시마다 지도 중심을 내 위치로 자동 이동(panTo). */
  follow?: boolean;
  stations: StationWithPrice[];
  /** 전국 최저가 TOP10(화면 영역 무관). 이 목록을 핀/메달 오버레이로 항상 직접 렌더한다. */
  nationalTop10?: NationalTop10Item[];
  /**
   * 내 현재 위치 기준 반경 10km 내 최저가 TOP10. 위치 권한이 잡혔을 때만 채워진다.
   * 전국 메달과 별개로, 파란 계열 마커로 항상 직접 렌더해 내 근처 최저가가 보이게 한다.
   */
  nearbyTop10?: StationWithPrice[];
  /** 현재 선택 유종 코드. TOP10 마커 클릭 시 합성하는 StationWithPrice의 product 채움용. */
  product?: ProductCode;
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
  heading = null,
  recenterSignal = 0,
  suppressAutoCenter = false,
  follow = false,
  stations,
  nationalTop10,
  nearbyTop10,
  product = 'B027',
  onBoundsChange,
  onViewChange,
  onUserPan,
  onMarkerClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  // 전국 최저가 TOP10 핀/메달 오버레이는 bbox 마커와 독립적으로 관리한다.
  // (화면 영역과 무관하게 항상 그 좌표에 표시되어야 하므로 별도 배열로 분리)
  const topOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  // 내 주변(10km) TOP10 핀 오버레이 — bbox 마커/전국 메달과 독립적으로 관리.
  const nearOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const myOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const myCircleRef = useRef<kakao.maps.Circle | null>(null);
  // 내 위치 마커 내부의 회전 대상 엘리먼트 — heading 변경 시 위치 effect 재실행 없이 회전만 갱신.
  const myArrowRef = useRef<HTMLDivElement | null>(null);
  // 진행 중이 아닐 때(heading 없음) 직전 방향을 유지하기 위한 마지막 유효 각도.
  const lastHeadingRef = useRef<number | null>(null);
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
  // 현재 카카오 level. 줌만 변경돼도 가격 라벨 노출 정책(showLabel)을 마커에 반영하기 위해
  // idle 때 갱신한다. (일반 마커는 stations 재조회로도 갱신되지만 TOP10 오버레이는 독립이므로 필요)
  const [mapLevel, setMapLevel] = useState(initialLevel);

  // 전국 최저가 TOP10에 포함된 station id 집합.
  // 일반 마커 루프에서 이 id를 건너뛰어 메달 오버레이와의 이중 렌더를 막는다.
  const top10Rank = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of nationalTop10 ?? []) m.set(t.id, t.rank);
    return m;
  }, [nationalTop10]);

  // 내 주변(10km) TOP10에 포함된 station id → 순위(1~10).
  // 중복 방지 우선순위(전국메달 > 내주변 > 일반)에 따라, 전국 TOP10에 이미 든 id는 제외한다.
  // 일반 마커 루프와 내 주변 핀 루프 모두 이 Map을 기준으로 그려 이중 렌더를 막는다.
  const nearbyRank = useMemo(() => {
    const m = new Map<string, number>();
    let rank = 1;
    for (const s of nearbyTop10 ?? []) {
      if (top10Rank.has(s.id)) continue; // 전국 메달이 우선 — 내 주변에선 생략
      m.set(s.id, rank);
      rank += 1;
    }
    return m;
  }, [nearbyTop10, top10Rank]);

  // 마커 안쪽 색(가격 tier)을 "화면 표시 집합의 상대 가격 분포"로 산출하기 위한 임계값.
  // 고정 ±30원이 아니라 분위수(하위/상위 33%) 기준이라, 가격 폭이 좁아도 저렴/보통/비쌈이 갈린다.
  // 표시 집합 = bbox 일반 마커 + 전국 TOP10 + 내 주변 TOP10(중복 id는 가격이 동일하므로 분포 영향 미미).
  // 줌/이동 시 표시 집합이 바뀌면 임계값도 바뀌어 색이 상대적으로 재산정된다(상대 비교라 정상).
  // 정렬/분위수는 렌더마다 1회만 수행(useMemo)해 마커 루프에서 재사용한다.
  const tierThresholds = useMemo(() => {
    const prices: number[] = [];
    for (const s of stations) prices.push(s.price);
    for (const t of nationalTop10 ?? []) prices.push(t.price);
    for (const s of nearbyTop10 ?? []) prices.push(s.price);
    return priceTierThresholds(prices);
  }, [stations, nationalTop10, nearbyTop10]);

  // TOP10 핀 클릭 시 onMarkerClick에 넘길 최소 StationWithPrice 합성.
  // 호출부는 상세 이동(s.id)만 사용하지만, 시그니처 일관성을 위해 항목 값으로 채운다.
  // 위치/가격은 top10 항목 값(bbox 비동기 불일치 차단), product는 현재 선택 유종.
  const top10ToStation = (t: NationalTop10Item): StationWithPrice => ({
    id: t.id,
    name: t.name,
    brand: t.brand,
    isSelf: false,
    sido: '01',
    address: '',
    lat: t.lat,
    lng: t.lng,
    product,
    price: t.price,
    tradeDate: '',
  });

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

    // 줌 변경 시 라벨 노출 정책을 마커에 반영 (값이 실제로 바뀔 때만 setState)
    setMapLevel((prev) => (prev === map.getLevel() ? prev : map.getLevel()));

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

  // 일반 주유소 마커 갱신 (bbox stations). 전국 TOP10에 속한 id는 건너뛰고,
  // 메달/핀은 아래의 별도 effect가 독립 오버레이로 그린다(이중 렌더 방지).
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 일반 오버레이 제거
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const showLabel = map.getLevel() <= 5; // 줌 인 상태에서만 가격 라벨

    for (const s of stations) {
      // 중복 방지(우선순위: 전국메달 > 내주변 > 일반).
      // 전국 TOP10 또는 내 주변 TOP10에 포함된 주유소는 각 강조 오버레이로만 표시.
      if (top10Rank.has(s.id) || nearbyRank.has(s.id)) continue;

      const tier = priceTier(s.price, tierThresholds);
      const tierColor = tier === 'cheap' ? '#16A34A' : tier === 'expensive' ? '#DC2626' : '#EAB308';
      const brandColor = BRAND_COLOR[s.brand] ?? '#666';

      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.style.position = 'relative';

      // === 일반 마커: 원형 점 (색 역할 반전) ===
      // 안쪽(채움) = 가격 tier 색(초록/노랑/빨강), 테두리 = 브랜드 색.
      // 가격 라벨/꼬리도 안쪽과 같은 tier 색으로 통일(가격 수준이 한눈에).
      content.innerHTML = showLabel
        ? `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="padding:4px 8px;border-radius:10px;background:${tierColor};color:white;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
            ₩${s.price.toLocaleString()}
          </div>
          <div style="width:8px;height:8px;background:${tierColor};transform:rotate(45deg);margin-top:-4px"></div>
          <div style="width:16px;height:16px;border-radius:50%;background:${tierColor};border:3px solid ${brandColor};box-shadow:0 1px 3px rgba(0,0,0,.3);margin-top:-2px"></div>
        </div>`
        : `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center">
          <div style="width:18px;height:18px;border-radius:50%;background:${tierColor};border:3px solid ${brandColor};box-shadow:0 2px 4px rgba(0,0,0,.25)"></div>
        </div>`;

      content.addEventListener('click', () => onMarkerClick?.(s));

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        content,
        yAnchor: 1,
        clickable: true,
        zIndex: 1,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }
  }, [ready, stations, top10Rank, nearbyRank, tierThresholds, onMarkerClick, mapLevel]);

  // 전국 최저가 TOP10 핀/메달 오버레이 — bbox stations 포함 여부와 무관하게 항상 렌더.
  // 위치/가격/순위는 모두 nationalTop10 항목 값을 사용한다(bbox의 비동기 타이밍 불일치 차단).
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 TOP10 오버레이 제거
    topOverlaysRef.current.forEach((o) => o.setMap(null));
    topOverlaysRef.current = [];

    const showLabel = map.getLevel() <= 5; // 줌 인 상태에서만 가격 라벨

    for (const t of nationalTop10 ?? []) {
      const r = t.rank;
      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.style.position = 'relative';

      // === TOP10: 물방울 핀 + 순위 메달/숫자 (모든 줌에서 형태로 구분) ===
      // 라벨 줌에서는 가격 라벨을 핀 위에 함께, 축소 줌에서는 핀만 (단, 크게).
      // 핀 본체=가격 tier 색, 테두리=브랜드 색(일반 마커와 색 역할 통일).
      // 카테고리는 물방울 형태 + 메달/순위 + 가격 라벨의 앰버 테두리로 구분.
      const tier = priceTier(t.price, tierThresholds);
      const tierColor = tier === 'cheap' ? '#16A34A' : tier === 'expensive' ? '#DC2626' : '#EAB308';
      const brandColor = BRAND_COLOR[t.brand] ?? '#666';
      const pinSize = showLabel ? 38 : 42; // 축소 줌에서 오히려 더 크게 → 전국에서 눈에 띔
      const pin = topPinSvg(r, pinSize, tierColor, brandColor);
      content.innerHTML = showLabel
        ? `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:1px">
          <div style="padding:4px 8px;border-radius:10px;background:${HL_COLOR};color:white;font-size:12px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;border:2px solid ${HL_RING}">
            ₩${t.price.toLocaleString()}
          </div>
          <div style="width:8px;height:8px;background:${HL_COLOR};border-right:2px solid ${HL_RING};border-bottom:2px solid ${HL_RING};transform:rotate(45deg);margin-top:-5px"></div>
          <div style="margin-top:0">${pin}</div>
        </div>`
        : `<div style="position:relative;display:flex;justify-content:center">${pin}</div>`;

      // 클릭 시 상세 이동(onMarkerClick과 동일 동작). top10 항목으로 최소 StationWithPrice 합성.
      // 호출부는 s.id만 사용하므로 위치/가격/순위 출처는 top10 값으로 일관.
      content.addEventListener('click', () => onMarkerClick?.(top10ToStation(t)));

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(t.lat, t.lng),
        content,
        yAnchor: 1,
        clickable: true,
        // 일반 마커(zIndex 1) 위에 그려지도록 상향. 순위 높을수록 더 위.
        zIndex: 10 + (11 - r),
      });
      overlay.setMap(map);
      topOverlaysRef.current.push(overlay);
    }
    // top10ToStation은 product/렌더마다 새로 생성되므로 product를 직접 의존성에 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, nationalTop10, product, tierThresholds, onMarkerClick, mapLevel]);

  // 내 주변(10km) TOP10 핀/배지 오버레이 — 전국 메달/일반 마커와 독립적으로 항상 렌더.
  // 위치/가격/순위는 nearbyTop10(이미 가격순) 기준. 전국 메달과 겹치는 id는 nearbyRank에서 제외됨.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 내 주변 오버레이 제거
    nearOverlaysRef.current.forEach((o) => o.setMap(null));
    nearOverlaysRef.current = [];

    const showLabel = map.getLevel() <= 5; // 줌 인 상태에서만 가격 라벨

    for (const s of nearbyTop10 ?? []) {
      const rank = nearbyRank.get(s.id);
      if (rank == null) continue; // 전국 메달과 중복(제외됨) → 내 주변에선 생략

      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.style.position = 'relative';

      // === 내 주변 TOP10: 원형 배지 + 순위 숫자 (전국 물방울 핀과 형태로 구분) ===
      // 둥근 핀(원 + 아래 꼬리). 색 역할 통일: 본체=가격 tier 색, 테두리=브랜드 색.
      // 카테고리는 배지 형태 + 순위 + 가격 라벨의 블루 테두리로 구분.
      // 순위 숫자는 본체(tier 색) 대비에 맞춘 텍스트색으로 원 안에 표시.
      const tier = priceTier(s.price, tierThresholds);
      const tierColor = tier === 'cheap' ? '#16A34A' : tier === 'expensive' ? '#DC2626' : '#EAB308';
      const brandColor = BRAND_COLOR[s.brand] ?? '#666';
      const txt = readableText(tierColor);
      const badge = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center">
          <div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${tierColor};border:3px solid ${brandColor};box-shadow:0 2px 4px rgba(0,0,0,.3);color:${txt};font-size:12px;font-weight:800;line-height:1">${rank}</div>
          <div style="width:7px;height:7px;background:${tierColor};transform:rotate(45deg);margin-top:-4px"></div>
        </div>`;
      content.innerHTML = showLabel
        ? `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:1px">
          <div style="padding:3px 7px;border-radius:9px;background:${NEAR_COLOR};color:white;font-size:11px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;border:2px solid ${NEAR_RING}">
            ₩${s.price.toLocaleString()}
          </div>
          <div style="margin-top:1px">${badge}</div>
        </div>`
        : badge;

      content.addEventListener('click', () => onMarkerClick?.(s));

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        content,
        yAnchor: 1,
        clickable: true,
        // 일반 마커(zIndex 1)보다 위, 전국 메달(zIndex 10~)보다는 아래에 둔다(우선순위 시각화).
        zIndex: 6,
      });
      overlay.setMap(map);
      nearOverlaysRef.current.push(overlay);
    }
  }, [ready, nearbyTop10, nearbyRank, tierThresholds, onMarkerClick, mapLevel]);

  // 내 위치 마커 + 1km 원
  useEffect(() => {
    if (!ready || !mapRef.current || !myLocation) return;
    const map = mapRef.current;
    const pos = new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng);

    if (myOverlayRef.current) myOverlayRef.current.setMap(null);
    if (myCircleRef.current) myCircleRef.current.setMap(null);

    // 내 위치 마커: 파란 점 + 진행 방향 화살표(▲).
    // 바깥 wrapper(중앙 정렬) > 회전 레이어(myArrowRef, transform:rotate) > 화살표 + 점.
    // 화살표는 점보다 위에 떠 있는 작은 삼각형으로, heading 각도로 회전한다.
    // 지도는 북쪽 고정이므로 마커만 회전해 "내가 향하는 방향"을 나타낸다.
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:28px;height:28px;pointer-events:none';

    const rotor = document.createElement('div');
    // 초기 회전: 직전 유효 각도 → 현재 heading 순. 둘 다 없으면 0(점만 보이는 형태).
    const initDeg = (Number.isFinite(heading as number) ? (heading as number) : lastHeadingRef.current) ?? 0;
    const hasDir = Number.isFinite(heading as number) || lastHeadingRef.current !== null;
    rotor.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
      + `transform:rotate(${initDeg}deg);transition:transform .3s ease-out`;
    // 진행 방향 화살표(위쪽=0°). conic 없이 순수 삼각형 SVG로 다크모드 무관 가시성 확보.
    rotor.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 28 28" style="position:absolute;top:-9px;left:0;${hasDir ? '' : 'opacity:0'};filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">
        <path d="M14 1 L20 13 L14 10 L8 13 Z" fill="#1d4ed8" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
      <div style="width:14px;height:14px;border-radius:50%;background:#1d4ed8;border:3px solid #fff;box-shadow:0 0 0 4px rgba(29,78,216,.25)"></div>`;
    wrap.appendChild(rotor);
    myArrowRef.current = rotor;

    const overlay = new window.kakao.maps.CustomOverlay({
      position: pos, content: wrap, yAnchor: 0.5, xAnchor: 0.5, zIndex: 5,
    });
    overlay.setMap(map);
    myOverlayRef.current = overlay;

    myCircleRef.current = new window.kakao.maps.Circle({
      center: pos, radius: 1000,
      strokeWeight: 1, strokeColor: '#1d4ed8', strokeOpacity: 0.6, strokeStyle: 'dash',
      fillColor: '#1d4ed8', fillOpacity: 0.06,
    });
    myCircleRef.current.setMap(map);

    // 첫 위치 획득 시에만 자동으로 내 위치로 중심 이동 (이후 위치 갱신엔 사용자 패닝 방해 X).
    // level 6(zoom 9, 시군구 단위)로 줌인 → 내 지역 주유소가 화면에 여러 개 들어와
    // bbox 최저가가 자연히 보이게 한다(별도 데이터/뷰 없이 줌 경험으로 해결).
    if (!didAutoCenterRef.current) {
      didAutoCenterRef.current = true;
      map.setLevel(MY_AREA_LEVEL);
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
    map.setLevel(MY_AREA_LEVEL);
    panToProgrammatic(new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  // heading(진행 방향) 변경 시 내 위치 마커 화살표만 회전 갱신.
  // 위치 effect를 재실행하지 않아(마커 재생성 X) 부드러운 transition이 유지된다.
  // - 유효 heading이면 그 각도로 회전 + 화살표 표시, 직전 각도를 기억.
  // - heading 없음(정지/미지원)이면 직전 방향을 유지(화살표 그대로), 둘 다 없으면 점만.
  useEffect(() => {
    const rotor = myArrowRef.current;
    if (!rotor) return;
    const arrow = rotor.querySelector('svg') as SVGElement | null;
    if (Number.isFinite(heading as number)) {
      lastHeadingRef.current = heading as number;
      // 최단 경로 회전을 위한 각도 정규화 없이도 transition은 자연스러우므로 단순 적용.
      rotor.style.transform = `rotate(${heading as number}deg)`;
      if (arrow) arrow.style.opacity = '1';
    } else if (lastHeadingRef.current !== null) {
      rotor.style.transform = `rotate(${lastHeadingRef.current}deg)`;
      if (arrow) arrow.style.opacity = '1';
    } else if (arrow) {
      arrow.style.opacity = '0'; // 방향 정보 전무 → 점만 표시
    }
  }, [heading, myLocation]);

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
