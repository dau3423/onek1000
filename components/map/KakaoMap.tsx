'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadKakao } from './loadKakao';
import type { StationWithPrice, NationalTop10Item, ProductCode, StationPoint, RoutePlan } from '@/types/station';
import { BRAND_COLOR } from '@/types/station';
import { priceTier, priceTierThresholds } from '@/lib/map/geo';
import { TIER_FACE, faceMarkerSvg, numberMarkerSvg, skullMarkerSvg } from '@/lib/map/markerFace';
import type { EvStationMarker } from '@/types/ev';
import { buildEvMarkerContent } from '@/lib/map/evMarker';
import { GRAY_DOTS_ENABLED } from '@/lib/flags';

/** BottomSheet와 공유하는 활성 탭 타입. 'area'=이 지역, 'nearby'=내 주변 10km. */
export type MapListTab = 'area' | 'nearby';

// === 전국 TOP10 강조 마커 디자인 상수/헬퍼 (일반 마커와 형태부터 구분) ===
// 색 역할은 일반 마커와 통일: 본체(안쪽)=가격 tier 색, 테두리=브랜드 색.
// "전국 TOP10" 카테고리는 물방울 핀 형태 + 왕관(👑) + 순위 숫자로 구분하고,
// 추가로 "반짝이는 황금색"(골드 글로우 펄스 + 가격 라벨 shimmer, globals.css)으로
// 전국 최저가임을 한눈에 강조한다.

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

// 회색 점(비하이라이트 주유소) 표시 임계 카카오 level. 이 값 이하로 확대했을 때만 표시하고,
// 그 이상 줌아웃하면 숨긴다(점이 화면을 가득 메우는 것 방지, 클러스터링 미사용).
// level 5 = zoom 10(주변 동네가 보이는 수준)부터 노출 — 가격 라벨 노출 기준(level≤5)과 일치.
const GRAY_DOT_MAX_LEVEL = 5;

// querySelector 속성값 선택자에 안전하게 끼우기 위한 이스케이프(CSS.escape 폴백).
// station id는 보통 영숫자(Opinet UNI_ID)지만, 따옴표/특수문자가 와도 셀렉터가 깨지지 않게 한다.
function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/["\\]/g, '\\$&');
}

// HTML 문자열에 삽입할 사용자 입력(장소명 등) 이스케이프 — innerHTML XSS 방어.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
// golden=true(전국 TOP10): 핀 본체 자체를 "황금색"으로 칠한다. 머리(테두리)=진한 골드,
// 흰 링 → 머리 안쪽=밝은 골드 그라데이션으로 한눈에 황금 마커로 보이게 한다(글로우/shimmer는
// 호출부에서 래퍼/라벨에 덧입힘). golden=false(내 주변 등): 본체=tier 색, 테두리=brandColor.
// 모든 전국 TOP10 핀은 "왕관(👑) + 순위 숫자(1~10)"로 표시한다(메달 제거).
// 왕관은 핀 머리 위에 떠 있게 두고, 순위 숫자는 머리 안에 배치(본체 색 대비 텍스트색).
// size: 핀 전체 높이(px).
function topPinSvg(rank: number, size: number, tierColor: string, brandColor: string, golden = false) {
  const w = Math.round(size * 0.72);
  const headR = w * 0.5;
  // 황금 마커: 본체=메탈릭 골드, 테두리=브랜드 색(금색 몸통과 분리되도록 흰 외곽선 한 겹 추가).
  // 일반: 본체=tier 색, 테두리=브랜드 색. 골드는 머리 안쪽 다단계 그라데이션으로 금속 광택을 낸다.
  const bodyColor = golden ? '#F5C518' : tierColor; // 머리 안쪽 코어(메탈릭 골드)
  const ringColor = golden ? '#9A6B12' : brandColor; // 머리 외곽 링(golden은 진한 골드 음영 유지)
  const txt = golden ? '#4a3208' : readableText(tierColor);
  // 두 자리(10)는 살짝 작게 그려 머리 원 안에 들어오게 한다.
  const numFont = rank >= 10 ? headR * 0.66 : headR * 0.82;
  const inner = `<text x="${headR}" y="${headR}" text-anchor="middle" dominant-baseline="central" font-size="${numFont}" font-weight="800" fill="${txt}">${rank}</text>`;
  // 왕관(👑): 머리 원 위쪽에 얹어 "최저가 TOP10" 단서를 항상 노출. 작은 인라인 SVG.
  const crownW = w * 0.62;
  const crownH = crownW * 0.62;
  const crownX = (w - crownW) / 2;
  const crownY = -crownH * 0.62; // 머리 원 위로 살짝 겹쳐 올림
  const crown = crownSvg(crownX, crownY, crownW, crownH, golden);
  // 물방울 경로: 위쪽 원 + 아래로 뾰족한 꼬리.
  // 일반 마커와 동일 원칙: 머리를 ringColor로 채워 두꺼운 테두리처럼 보이게 한 뒤,
  // 그 안에 흰 간격 링 → bodyColor 얼굴 원을 겹쳐 "두꺼운 테두리 — 흰 링 — 본체 머리"로 분리.
  // golden=true면 본체를 다단계 메탈릭 골드 그라데이션(밝은 하이라이트→코어→음영)으로 칠해
  // 금속 광택을 낸다. 추가로 머리 상단에 작은 흰색 하이라이트 점을 얹어 광택 반사를 표현한다.
  // 왕관이 머리 위로 올라가므로 viewBox 상단에 여유(crownH)를 둔다.
  const gid = `g${rank}-${golden ? 'au' : 'n'}-${Math.round(size)}`; // 머리 코어 그라데이션 id 충돌 방지
  const bid = `b${rank}-${golden ? 'au' : 'n'}-${Math.round(size)}`; // 물방울 몸통 그라데이션 id 충돌 방지
  const headFill = golden ? `url(#${gid})` : bodyColor;
  // golden=true면 물방울 몸통 전체를 밝은 메탈릭 골드 세로 그라데이션으로 채워(머리→꼬리) 균일하게
  // 반짝이게 한다. 외곽선(stroke)은 진한 골드 대신 "브랜드 색"으로 칠해, 일반 마커와 동일하게
  // 브랜드를 테두리로 구분한다(앱 마커 규칙: 브랜드=테두리 색, MarkerLegend 참고).
  // golden=false면 기존처럼 ringColor(브랜드) 단색 채움 + stroke 없음 — 동작 불변.
  const bodyFill = golden ? `url(#${bid})` : ringColor;
  // 브랜드 색 테두리: 또렷하게 보이도록 두께를 키운다(기존 w*0.03 → w*0.06).
  const brandStrokeW = w * 0.06;
  const bodyStroke = golden ? ` stroke="${brandColor}" stroke-width="${brandStrokeW}"` : '';
  // S-OIL(노랑)·현대(주황) 등 금색과 명도가 가까운 브랜드 색은 금색 몸통에 묻힐 수 있다.
  // 브랜드 테두리 바깥에 아주 얇은 흰색 외곽선을 한 겹 더 둬(같은 path를 더 굵은 흰 stroke로
  // 먼저 그림) 어떤 브랜드 색이든 금색 몸통과 분리돼 보이게 한다. golden일 때만 그린다.
  const bodyDropPath = `M${headR} ${size} C${headR * 0.15} ${size * 0.62} 0 ${headR * 1.25} 0 ${headR} a${headR} ${headR} 0 1 1 ${w} 0 C${w} ${headR * 1.25} ${headR * 1.85} ${size * 0.62} ${headR} ${size} Z`;
  const bodyOutline = golden
    ? `<path d="${bodyDropPath}" fill="none" stroke="#ffffff" stroke-width="${brandStrokeW + w * 0.045}" stroke-linejoin="round"/>`
    : '';
  // 머리 코어 다단계 골드: #FFF7CC(밝은 하이라이트)→#FDE68A→#F5C518(코어)→#E6B800→#C8941A(음영)
  // 몸통 세로 골드: 위(머리)는 밝게(#FDE68A) → 아래(꼬리)는 약간 진하게(#D6A019)로 입체감.
  const goldGrad = golden
    ? `<defs><linearGradient id="${gid}" x1="0.25" y1="0" x2="0.75" y2="1">
        <stop offset="0" stop-color="#FFF7CC"/>
        <stop offset="0.28" stop-color="#FDE68A"/>
        <stop offset="0.55" stop-color="#F5C518"/>
        <stop offset="0.8" stop-color="#E6B800"/>
        <stop offset="1" stop-color="#C8941A"/>
      </linearGradient>
      <linearGradient id="${bid}" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0" stop-color="#FDE68A"/>
        <stop offset="0.45" stop-color="#F5C518"/>
        <stop offset="1" stop-color="#D6A019"/>
      </linearGradient></defs>`
    : '';
  // 금속 광택 반사 하이라이트(머리 좌상단의 작은 흰 점) — 골드 마커에만.
  const gloss = golden
    ? `<ellipse cx="${headR * 0.66}" cy="${headR * 0.6}" rx="${headR * 0.26}" ry="${headR * 0.18}" fill="#ffffff" opacity="0.7"/>`
    : '';
  // 좌우 여백(viewBox 패딩): 물방울 path 좌우 끝(x=0, x=w)에서 골드 외곽선/브랜드 stroke가
  // path 중심선 기준 양쪽으로 번지므로(외곽선 두께 약 w*0.105 → 절반 w*0.0525), 그만큼이
  // viewBox(0~w) 밖으로 잘렸다. 좌우에 대칭 패딩을 둬 stroke가 온전히 보이게 한다.
  // 좌우 동일하게 더하므로 핀 꼬리(x=headR=w/2)는 박스 가로 중앙을 유지 → anchor 불변.
  const padX = Math.ceil(w * 0.07);
  // 실제 픽셀 폭/viewBox 모두 좌우 padX만큼 확장. 높이/세로 anchor는 기존 그대로.
  const vbW = w + padX * 2;
  const drawW = w + padX * 2; // SVG 표시 폭(px) — viewBox와 1:1로 키워 도형 크기 불변
  return `<svg width="${drawW}" height="${size - crownY}" viewBox="${-padX} ${crownY} ${vbW} ${size - crownY}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    ${goldGrad}
    ${bodyOutline}
    <path d="${bodyDropPath}" fill="${bodyFill}"${bodyStroke}/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.80}" fill="#ffffff"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.66}" fill="${headFill}"/>
    ${gloss}
    ${inner}
    ${crown}
  </svg>`;
}

// 왕관(👑) 인라인 SVG — OS 무관 동일 모양. 골드 채움 + 흰 외곽선으로 어느 배경에서도 식별.
// (x,y,w,h) 영역에 맞춰 path 좌표를 viewBox 0 0 24 16 기준에서 스케일/이동한다.
// golden=true면 핀 본체와 같은 메탈릭 골드 그라데이션(밝은 하이라이트→음영)으로 통일감을 준다.
function crownSvg(x: number, y: number, w: number, h: number, golden = false) {
  const sx = w / 24;
  const sy = h / 16;
  const cid = `cg-${Math.round(x)}-${Math.round(w)}`; // 그라데이션 id 충돌 방지
  const fill = golden ? `url(#${cid})` : '#F59E0B';
  const grad = golden
    ? `<defs><linearGradient id="${cid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFF3B0"/>
        <stop offset="0.5" stop-color="#F5C518"/>
        <stop offset="1" stop-color="#D6A019"/>
      </linearGradient></defs>`
    : '';
  return `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">
    ${grad}
    <path d="M2 13 L1 4 L8 9 L12 2 L16 9 L23 4 L22 13 Z" fill="${fill}" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="2" y="13" width="20" height="2.4" rx="1" fill="${fill}" stroke="#ffffff" stroke-width="1.2"/>
  </g>`;
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
  /**
   * 화면 영역 내 "전체 주유소"(가격 유무 무관). 이 중 하이라이트(전국 TOP/지역 최저가/내 주변/
   * 일반 마커로 이미 그려진 stations)에 안 든 주유소를 작은 회색 점으로 렌더한다.
   * 일정 줌 이상 확대(level ≤ GRAY_DOT_MAX_LEVEL)일 때만 표시한다(줌 게이팅).
   */
  allStations?: StationPoint[];
  /** 전국 최저가 TOP10(화면 영역 무관). 이 목록을 핀/메달 오버레이로 항상 직접 렌더한다. */
  nationalTop10?: NationalTop10Item[];
  /**
   * 내 현재 위치 기준 반경 10km 내 최저가 TOP10. 위치 권한이 잡혔을 때만 채워진다.
   * 전국 메달과 별개로, 파란 계열 마커로 항상 직접 렌더해 내 근처 최저가가 보이게 한다.
   */
  nearbyTop10?: StationWithPrice[];
  /** 현재 선택 유종 코드. TOP10 마커 클릭 시 합성하는 StationWithPrice의 product 채움용. */
  product?: ProductCode;
  /**
   * BottomSheet의 현재 활성 탭. 이 탭의 목록 주유소 마커를 "표정 대신 가격 순위 숫자"로 표시한다.
   * - 'area': 이 지역(bbox stations) 목록 → 일반 마커가 숫자(가격 오름차순 순위).
   * - 'nearby': 내 주변 10km 목록(nearbyStations) → 내 주변 마커가 숫자.
   * 비활성 집합 마커는 기존 표정을 유지한다.
   */
  activeTab?: MapListTab;
  /**
   * '내 주변' 탭 목록 모집단(반경 내 전체). 활성 탭이 'nearby'일 때 이 집합의 가격순 순위를
   * 일반 마커/내 주변 핀에 숫자로 표시한다. BottomSheet의 nearbyStations와 동일 배열을 받는다.
   */
  nearbyStations?: StationWithPrice[];
  /**
   * "고속도로 휴게소만" 필터 활성 여부. true면 expStations(전국 고속도로 주유소)를
   * 전용 렌더한다: 모든 EXP = 일반 가격 마커(priceTier 색 동심원 + 줌인 가격 라벨),
   * 그중 전국 가격 최저가 TOP10만 순위 숫자로 강조.
   * 모든 EXP 마커는 줌 게이팅을 면제해 줌을 아무리 줄여도 항상 보인다.
   * 이 모드에서는 일반 bbox 마커/전국·내주변 TOP10 강조 마커를 그리지 않는다(EXP 전용 화면).
   */
  expOnly?: boolean;
  /** 전국 고속도로(EXP) 주유소 목록(화면 영역 무관, 가격 포함). expOnly일 때만 사용. */
  expStations?: StationWithPrice[];
  /** 지도 레이어. 'ev'면 주유소 마커 대신 충전소 마커를 그린다. 기본 'gas'(주유소). */
  layer?: 'gas' | 'ev';
  /** 충전소 마커 목록(layer='ev'일 때만 렌더). */
  evStations?: EvStationMarker[];
  /** 충전소 마커 클릭 콜백(layer='ev'). */
  onEvMarkerClick?: (s: EvStationMarker) => void;
  /**
   * 경로별 최저가 계획. 설정되면 출발→도착 직선 Polyline + 출발/도착 핀 +
   * 경로 최저가 주유소 마커를 지도에 그리고, 출발~도착이 모두 보이도록 fit한다.
   * null이면 경로 오버레이를 그리지 않는다(일반 지도).
   */
  routePlan?: RoutePlan | null;
  /** 경로 최저가 주유소 마커 클릭 콜백(routePlan 표시 중). 미지정 시 onMarkerClick 사용. */
  onRouteStationClick?: (s: StationWithPrice) => void;
  /**
   * 지금 RouteAlert 배너에 떠 있는 "그" 경로 최저가 주유소 id. 해당 마커만 더 강하게
   * 강조(주황 펄스 + bounce)해, 배너가 가리키는 주유소를 지도에서 한눈에 찾게 한다.
   * null/미지정이면 어떤 경로 마커도 추가 강조하지 않는다.
   */
  highlightStationId?: string | null;
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
  allStations,
  nationalTop10,
  nearbyTop10,
  nearbyStations,
  expOnly = false,
  expStations,
  activeTab = 'area',
  product = 'B027',
  layer = 'gas',
  evStations,
  onEvMarkerClick,
  routePlan,
  onRouteStationClick,
  highlightStationId = null,
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
  // 회색 점(비하이라이트 주유소) 오버레이 — 일반/강조 마커와 독립 관리.
  const grayOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  // "고속도로만" 필터 전용 EXP 마커 오버레이(전국 top10 가격마커 + 나머지 일반 점) — 독립 관리.
  const expOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  // 전기차 충전소 마커 오버레이 — 주유소 마커와 독립 관리(레이어 전환 시 서로 간섭 없게).
  const evOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const onEvMarkerClickRef = useRef(onEvMarkerClick);
  useEffect(() => { onEvMarkerClickRef.current = onEvMarkerClick; }, [onEvMarkerClick]);
  // 경로(직선) Polyline — 경로 모드일 때만 그린다(독립 관리, 해제 시 제거).
  const routeLineRef = useRef<kakao.maps.Polyline | null>(null);
  // 경로 오버레이(출발/도착 핀 + 경로 최저가 주유소 마커) — Polyline과 함께 관리.
  const routeOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  // 경로 최저가 주유소 마커의 .route-blink 엘리먼트 맵(station id → el). 배너 강조 대상이
  // 바뀔 때 마커 재생성(=bounds 재fit) 없이 focus 클래스만 토글하기 위해 보관한다.
  const routeBlinkElsRef = useRef<Map<string, HTMLElement>>(new Map());
  // 경로 최저가 마커 오버레이 맵(station id → overlay). 강조 대상을 다른 마커 위로 올리기 위함.
  const routeStationOverlaysRef = useRef<Map<string, kakao.maps.CustomOverlay>>(new Map());
  // 경로 최저가 dedup으로 "기존 일반 마커"에 blink 클래스를 입힌 엘리먼트들. routePlan 해제/변경 시
  // 깔끔히 제거(클래스 제거)하기 위해 보관한다. (마커 재생성 시에도 dedup effect가 재적용)
  const routeOnMarkerElsRef = useRef<HTMLElement[]>([]);
  const onRouteStationClickRef = useRef(onRouteStationClick);
  useEffect(() => { onRouteStationClickRef.current = onRouteStationClick; }, [onRouteStationClick]);
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);
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

  // === 활성 탭 목록의 "가격순 순위" 맵 (마커에 표정 대신 숫자로 표시) ===
  // BottomSheet 목록과 동일 기준으로 순위를 매겨 목록 항목 ↔ 지도 마커를 숫자로 매칭한다.
  //  - 이 지역: stations를 가격 오름차순 정렬 → 상위 AREA_LIMIT(30)까지 1~N 순위.
  //  - 내 주변: nearbyStations를 가격 오름차순 정렬 → 상위 NEARBY_LIMIT(10)까지 1~N 순위.
  // (BottomSheet.tsx의 AREA_LIMIT/NEARBY_LIMIT와 동일 값 — 목록과 일치시키기 위함)
  const AREA_LIMIT = 30;
  const NEARBY_LIMIT = 10;
  const areaListRank = useMemo(() => {
    const m = new Map<string, number>();
    const sorted = [...stations].sort((a, b) => a.price - b.price);
    for (let i = 0; i < Math.min(AREA_LIMIT, sorted.length); i++) m.set(sorted[i].id, i + 1);
    return m;
  }, [stations]);

  // 경로 최저가 주유소 id 집합 — 중복 표시 제거(dedup) 및 기존 마커 blink 강조의 기준.
  // (좌표 근사가 아니라 station id로 정확히 판정한다.)
  const routeStationIds = useMemo(() => {
    const s = new Set<string>();
    for (const st of routePlan?.stations ?? []) s.add(st.id);
    return s;
  }, [routePlan]);

  // 경로 최저가 주유소 중 "이미 일반 가격/순위 마커로 그려진" id 집합.
  //  - 일반 bbox 가격 마커: stations(전국 TOP10/내주변 TOP10에 든 id는 그쪽 강조로 빠짐)
  //  - 전국 TOP10 핀 / 내 주변 TOP10 핀
  // 이 집합에 속한 경로 주유소는 별도 route 오버레이를 그리지 않고 기존 마커를 blink 강조한다.
  // (회색 점은 "가격 마커"가 아니므로 여기 제외 — 회색 점으로만 뜨는 경로 주유소는
  //  route 마커로 승격해 가격까지 보여준다. 회색 점 effect에서 해당 id를 제외한다.)
  // EV 레이어/"고속도로만" 필터에서는 일반/TOP 마커를 그리지 않으므로 dedup 대상도 비운다
  // (경로 모드는 주유소(gas) 화면에서 쓰이지만, 모드가 겹쳐도 안전하게 처리).
  const routeDupIds = useMemo(() => {
    const dup = new Set<string>();
    if (routeStationIds.size === 0) return dup;
    if (layer === 'ev' || expOnly) return dup;
    for (const s of stations) if (routeStationIds.has(s.id)) dup.add(s.id);
    for (const id of top10Rank.keys()) if (routeStationIds.has(id)) dup.add(id);
    for (const id of nearbyRank.keys()) if (routeStationIds.has(id)) dup.add(id);
    return dup;
  }, [routeStationIds, stations, top10Rank, nearbyRank, layer, expOnly]);
  const nearbyListRank = useMemo(() => {
    const m = new Map<string, number>();
    const sorted = [...(nearbyStations ?? [])].sort((a, b) => a.price - b.price);
    for (let i = 0; i < Math.min(NEARBY_LIMIT, sorted.length); i++) m.set(sorted[i].id, i + 1);
    return m;
  }, [nearbyStations]);

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

  // 회색 점 클릭 시 onMarkerClick에 넘길 최소 StationWithPrice 합성.
  // 호출부(handleMarkerClick)는 상세 이동(s.id)만 사용하지만, 시그니처 일관성을 위해 점 값으로 채운다.
  // 가격/거래일은 없으므로 0/빈값(상세 페이지에서 Opinet 실시간 조회로 채워진다).
  const pointToStation = (p: StationPoint): StationWithPrice => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    isSelf: p.isSelf,
    sido: '01',
    address: '',
    lat: p.lat,
    lng: p.lng,
    product,
    price: 0,
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

    // EV 레이어에서는 주유소 일반 마커를 그리지 않는다(위에서 제거만 하고 종료).
    if (layer === 'ev') return;
    // "고속도로만" 필터에서는 EXP 전용 effect가 전국 EXP를 직접 그리므로 일반 bbox 마커는 생략한다.
    if (expOnly) return;

    const showLabel = map.getLevel() <= 5; // 줌 인 상태에서만 가격 라벨

    for (const s of stations) {
      // 중복 방지(우선순위: 전국메달 > 내주변 > 일반).
      // 전국 TOP10 또는 내 주변 TOP10에 포함된 주유소는 각 강조 오버레이로만 표시.
      if (top10Rank.has(s.id) || nearbyRank.has(s.id)) continue;

      const tier = priceTier(s.price, tierThresholds);
      const tierColor = TIER_FACE[tier].color;
      const brandColor = BRAND_COLOR[s.brand] ?? '#666';

      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.style.position = 'relative';
      content.dataset.sid = s.id; // 경로 최저가 blink 강조 대상 탐색용(id 기준 dedup)

      // === 일반 마커: 동심원(색 역할 통일) ===
      // 안쪽(채움) = 가격 tier 색, 테두리 = 브랜드 색, 그 사이 흰 간격.
      // 활성 탭이 '이 지역'이고 이 주유소가 목록(가격순 상위 30)에 들면 안쪽을 "순위 숫자"로,
      // 그 외에는 기존 tier별 표정(😍/🙂/😠)으로 그린다.
      // 숫자/표정 모두 인라인 SVG라 OS 무관하게 동일하게 보이고, 라벨 줌에서는 가격 라벨을
      // 위에 함께, 축소 줌에서는 마커만(약간 크게) 표시한다.
      const faceSize = showLabel ? 26 : 30;
      const areaRank = activeTab === 'area' ? areaListRank.get(s.id) : undefined;
      const face = areaRank != null
        ? numberMarkerSvg(tier, faceSize, areaRank, { ring: brandColor, ringWidth: 8, gap: 4 })
        : faceMarkerSvg(tier, faceSize, { ring: brandColor, ringWidth: 8, gap: 4 });
      content.innerHTML = showLabel
        ? `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="padding:4px 8px;border-radius:10px;background:${tierColor};color:white;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
            ₩${s.price.toLocaleString()}
          </div>
          <div style="width:8px;height:8px;background:${tierColor};transform:rotate(45deg);margin-top:-4px"></div>
          <div style="margin-top:-1px">${face}</div>
        </div>`
        : `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center">
          ${face}
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
  }, [ready, stations, top10Rank, nearbyRank, tierThresholds, onMarkerClick, mapLevel, activeTab, areaListRank, layer, expOnly]);

  // 전국 최저가 TOP10 핀 오버레이 — bbox stations 포함 여부와 무관하게 항상 렌더.
  // 위치/가격/순위는 모두 nationalTop10 항목 값을 사용한다(bbox의 비동기 타이밍 불일치 차단).
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 TOP10 오버레이 제거
    topOverlaysRef.current.forEach((o) => o.setMap(null));
    topOverlaysRef.current = [];

    // EV 레이어/"고속도로만" 필터에서는 전국 TOP10 메달을 그리지 않는다
    // (expOnly는 전국 EXP top10을 EXP 전용 effect가 별도로 그린다).
    if (layer === 'ev' || expOnly) return;

    const showLabel = map.getLevel() <= 5; // 줌 인 상태에서만 가격 라벨

    for (const t of nationalTop10 ?? []) {
      const r = t.rank;
      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.style.position = 'relative';
      content.dataset.sid = t.id; // 경로 최저가 blink 강조 대상 탐색용(id 기준 dedup)

      // === TOP10: 물방울 핀 + 왕관(👑) + 순위 숫자 (모든 줌에서 형태로 구분) ===
      // 라벨 줌에서는 가격 라벨을 핀 위에 함께, 축소 줌에서는 핀만 (단, 크게).
      // 핀 본체=가격 tier 색, 테두리=브랜드 색(일반 마커와 색 역할 통일).
      // 카테고리는 물방울 형태 + 왕관 + 순위 + 가격 라벨의 앰버 테두리로 구분(메달 없이 전 순위 숫자).
      const tier = priceTier(t.price, tierThresholds);
      const tierColor = TIER_FACE[tier].color;
      const brandColor = BRAND_COLOR[t.brand] ?? '#666';
      const pinSize = showLabel ? 38 : 42; // 축소 줌에서 오히려 더 크게 → 전국에서 눈에 띔
      // 전국 TOP10은 핀 본체를 황금색으로(golden). tier/brand 색은 무시되지만 시그니처 유지.
      const pin = topPinSvg(r, pinSize, tierColor, brandColor, true);
      // 핀을 골드 글로우 펄스로 감싸고(강한 금빛이 빛났다 잦아듦), 그 안쪽 래퍼에는
      // 하이라이트 스윕(sheen: 빛이 핀을 훑고 지나감)과 작은 반짝이 별(sparkle) 2개를 얹어
      // "반짝이는 황금색"을 확실히 살린다. 모션 민감 시 globals.css에서 모두 중단된다.
      // pin SVG 자체 drop-shadow는 글로우 keyframe이 덮어쓰므로 형태에는 영향 없음.
      const glowPin = `<div class="top10-glow" style="animation:top10-gold-glow 2.4s ease-in-out infinite">
        <div class="top10-pin">
          ${pin}
          <span class="top10-sparkle top10-sparkle--a">✦</span>
          <span class="top10-sparkle top10-sparkle--b">✦</span>
        </div>
      </div>`;
      // 가격 라벨: 단색 앰버 → 황금 그라데이션 + shimmer 빛줄기로 "반짝이는 황금색" 강조.
      const goldLabel = `
          <div class="top10-shimmer" style="position:relative;padding:4px 8px;border-radius:10px;background:linear-gradient(135deg,#FDE68A,#F59E0B 55%,#B45309);color:#3a2a08;font-size:12px;font-weight:800;box-shadow:0 2px 6px rgba(180,83,9,.45);white-space:nowrap;border:1.5px solid #FCD34D;text-shadow:0 1px 0 rgba(255,255,255,.4)">
            ₩${t.price.toLocaleString()}
          </div>`;
      content.innerHTML = showLabel
        ? `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:1px">
          ${goldLabel}
          <div style="width:8px;height:8px;background:#F59E0B;border-right:1.5px solid #B45309;border-bottom:1.5px solid #B45309;transform:rotate(45deg);margin-top:-5px"></div>
          <div style="margin-top:0">${glowPin}</div>
        </div>`
        : `<div style="position:relative;display:flex;justify-content:center">${glowPin}</div>`;

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
  }, [ready, nationalTop10, product, tierThresholds, onMarkerClick, mapLevel, layer, expOnly]);

  // 내 주변(10km) TOP10 핀/배지 오버레이 — 전국 메달/일반 마커와 독립적으로 항상 렌더.
  // 위치/가격/순위는 nearbyTop10(이미 가격순) 기준. 전국 메달과 겹치는 id는 nearbyRank에서 제외됨.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 내 주변 오버레이 제거
    nearOverlaysRef.current.forEach((o) => o.setMap(null));
    nearOverlaysRef.current = [];

    // EV 레이어/"고속도로만" 필터에서는 내 주변 TOP10 핀을 그리지 않는다(EXP 전용 화면 일관성).
    if (layer === 'ev' || expOnly) return;

    const showLabel = map.getLevel() <= 5; // 줌 인 상태에서만 가격 라벨

    for (const s of nearbyTop10 ?? []) {
      // 표시 여부는 dedup용 nearbyRank로 판단(전국 메달과 중복이면 제외).
      // 단, 배지에 그리는 숫자는 BottomSheet '내 주변' 목록과 일치하도록 nearbyListRank를 우선 사용한다
      // (nearbyListRank는 nearbyStations 전체의 가격순 순위 = 목록 순위와 동일).
      if (nearbyRank.get(s.id) == null) continue; // 전국 메달과 중복(제외됨) → 내 주변에선 생략
      const rank = nearbyListRank.get(s.id) ?? nearbyRank.get(s.id)!;

      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.style.position = 'relative';
      content.dataset.sid = s.id; // 경로 최저가 blink 강조 대상 탐색용(id 기준 dedup)

      // === 내 주변 TOP10: 원형 배지 + 순위 숫자 (전국 물방울 핀과 형태로 구분) ===
      // 둥근 핀(원 + 아래 꼬리). 색 역할 통일: 본체=가격 tier 색, 테두리=브랜드 색.
      // 카테고리는 배지 형태 + 순위 + 가격 라벨의 블루 테두리로 구분.
      // 순위 숫자는 본체(tier 색) 대비에 맞춘 텍스트색으로 원 안에 표시.
      const tier = priceTier(s.price, tierThresholds);
      const tierColor = TIER_FACE[tier].color;
      const brandColor = BRAND_COLOR[s.brand] ?? '#666';
      const txt = readableText(tierColor);
      // 일반 마커와 동일 원칙: tier 색 얼굴 원 바깥에 흰 간격 링(2.5px) + 두꺼운 브랜드 테두리(4px)를
      // box-shadow로 겹쳐, 두께를 키워도 얼굴 원 크기는 유지하면서 브랜드 색이 또렷하게 보이게 한다.
      // 꼬리는 브랜드색으로 채워 브랜드 테두리 링의 아랫부분처럼 자연스럽게 이어지게 한다.
      const badge = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;padding-top:6px">
          <div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${tierColor};box-shadow:0 0 0 2.5px #fff,0 0 0 6.5px ${brandColor},0 2px 4px rgba(0,0,0,.3);color:${txt};font-size:12px;font-weight:800;line-height:1">${rank}</div>
          <div style="width:8px;height:8px;background:${brandColor};transform:rotate(45deg);margin-top:0px;position:relative;z-index:-1"></div>
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
  }, [ready, nearbyTop10, nearbyRank, nearbyListRank, tierThresholds, onMarkerClick, mapLevel, layer, expOnly]);

  // 전기차 충전소 마커 — layer='ev'일 때만 렌더(주유소 마커와 독립 오버레이).
  // 충전소(statId) 단위 1마커. 색=사용가능 충전기 유무, 라벨=사용가능/전체 + 급속 여부.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 EV 오버레이 제거
    evOverlaysRef.current.forEach((o) => o.setMap(null));
    evOverlaysRef.current = [];

    if (layer !== 'ev') return;

    const showLabel = map.getLevel() <= 6; // 충전소는 가격이 없어 조금 더 일찍 라벨 노출
    for (const s of evStations ?? []) {
      const content = buildEvMarkerContent(s, showLabel);
      content.addEventListener('click', () => onEvMarkerClickRef.current?.(s));
      // 사용가능(available>0) 충전소를 위에 그려 겹칠 때 우선 보이게 한다(강조).
      // 급속 보유는 그 다음 가중치. (마커 색/뱃지로도 구분되지만 z순서로 한 번 더 강조)
      const z = 2 + (s.availableChargers > 0 ? 2 : 0) + (s.hasFast ? 1 : 0);
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        content,
        yAnchor: 1,
        clickable: true,
        zIndex: z,
      });
      overlay.setMap(map);
      evOverlaysRef.current.push(overlay);
    }
  }, [ready, layer, evStations, mapLevel]);

  // 회색 점(비하이라이트 주유소) 오버레이 — 일정 줌 이상 확대(level ≤ GRAY_DOT_MAX_LEVEL)일 때만.
  // allStations(화면 내 전체 주유소) 중, 이미 강조/일반 마커로 그려진 id를 제외한 나머지를
  // 작은 회색 원으로 그린다(브랜드색/금액/라벨 없음). 탭하면 기존 마커와 동일하게 상세로 이동.
  // EV 레이어/줌아웃 상태에서는 그리지 않는다(클러스터링 미사용 — 줌 게이팅으로 밀도만 제어).
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 회색 점 제거
    grayOverlaysRef.current.forEach((o) => o.setMap(null));
    grayOverlaysRef.current = [];

    // 회색 점 기능 비활성(플래그)이거나, EV 레이어/"고속도로만" 필터이거나, 줌아웃 상태(level이 임계보다 큼)면 그리지 않는다.
    // ("고속도로만"에서는 EXP 전용 effect가 비-top10 EXP를 일반 점으로 직접 그린다 — 이중 렌더 방지.)
    if (!GRAY_DOTS_ENABLED || layer === 'ev' || expOnly || map.getLevel() > GRAY_DOT_MAX_LEVEL) return;

    // 하이라이트(이미 다른 마커로 그려진) 주유소 id 집합 — 전국 TOP10 + 내 주변 TOP10 + 일반 bbox 마커.
    const highlighted = new Set<string>();
    for (const s of stations) highlighted.add(s.id);
    for (const id of top10Rank.keys()) highlighted.add(id);
    for (const id of nearbyRank.keys()) highlighted.add(id);
    // 경로 최저가 주유소는 회색 점 대신 route 가격 마커(blink)로 그려진다 → 회색 점에서 제외(이중 표시 방지).
    for (const id of routeStationIds) highlighted.add(id);

    for (const p of allStations ?? []) {
      if (highlighted.has(p.id)) continue; // 하이라이트는 기존 마커로만 표시

      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -50%)';
      // 진회색 원 + 해골(skull) 아이콘(가격/브랜드색/라벨 없음). 순위권 표정 마커보다 조금 작게 깔린다.
      content.innerHTML = skullMarkerSvg(24);
      content.addEventListener('click', () => onMarkerClick?.(pointToStation(p)));

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(p.lat, p.lng),
        content,
        yAnchor: 0.5,
        xAnchor: 0.5,
        clickable: true,
        zIndex: 0, // 일반 마커(1)/강조 마커 아래에 깔린다.
      });
      overlay.setMap(map);
      grayOverlaysRef.current.push(overlay);
    }
    // pointToStation은 product/렌더마다 새로 생성되므로 product를 직접 의존성에 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, allStations, stations, top10Rank, nearbyRank, routeStationIds, mapLevel, layer, product, onMarkerClick, expOnly]);

  // === "고속도로 휴게소만" 필터 전용 EXP 마커 ===
  // expOnly일 때, 전국 고속도로 주유소(expStations)를 화면 줌/패닝과 무관하게 항상 전부 그린다
  // (줌 게이팅 면제 — 줌을 아무리 줄여도 모든 EXP가 보인다).
  //  - 모든 EXP를 일반 주유소 마커와 동일한 방식으로 그린다(priceTier 색 동심원 + 줌인 시 가격 라벨).
  //  - 그중 전국 가격 최저가 TOP10(가격 오름차순 상위 10)만 순위 숫자(numberMarkerSvg)로 강조,
  //    나머지(11위 이하)는 tier 표정(faceMarkerSvg)으로 — 둘 다 동일한 tier 색 가격 마커다(회색 점 제거).
  // expStations는 전국 집합이라 정렬해 top10을 매겨도 줌인으로 bbox가 좁아질 때 흔들리지 않는다(전국 고정).
  // EXP가 아닌 일반 마커/강조 마커는 expOnly에서 그리지 않으므로(위 effect들의 가드) 충돌이 없다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 EXP 오버레이 제거
    expOverlaysRef.current.forEach((o) => o.setMap(null));
    expOverlaysRef.current = [];

    // EV 레이어이거나 "고속도로만" 필터가 아니면 그리지 않는다(제거만 하고 종료).
    if (layer === 'ev' || !expOnly) return;

    const list = expStations ?? [];
    // 전국 가격 오름차순 정렬 → 상위 10 = top10(순위 숫자 강조), 나머지도 동일 가격 마커.
    const sorted = [...list].sort((a, b) => a.price - b.price);
    const topRank = new Map<string, number>();
    for (let i = 0; i < Math.min(10, sorted.length); i++) topRank.set(sorted[i].id, i + 1);

    // 가격 tier 색은 EXP 집합 자체의 상대 분포로 산정(전국 EXP 기준 저렴/보통/비쌈).
    // EXP만 보는 화면이므로 집합 내 상대 색이 자연스럽다(일반 bbox 마커가 화면 분포 기준인 것과 동일 취지).
    const expThresholds = priceTierThresholds(sorted.map((s) => s.price));
    const showLabel = map.getLevel() <= 5; // 줌 인 상태에서만 가격 라벨(일반 마커와 동일 정책)

    for (const s of list) {
      const rank = topRank.get(s.id);
      // === 모든 EXP = 일반 주유소 가격 마커 스타일(priceTier 색 동심원 + 줌인 가격 라벨) ===
      // top10만 순위 숫자(numberMarkerSvg), 나머지는 tier 표정(faceMarkerSvg)으로 차등.
      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.style.position = 'relative';
      const tier = priceTier(s.price, expThresholds);
      const tierColor = TIER_FACE[tier].color;
      const brandColor = BRAND_COLOR[s.brand] ?? '#666';
      const faceSize = showLabel ? 26 : 30;
      const face = rank != null
        ? numberMarkerSvg(tier, faceSize, rank, { ring: brandColor, ringWidth: 8, gap: 4 })
        : faceMarkerSvg(tier, faceSize, { ring: brandColor, ringWidth: 8, gap: 4 });
      content.innerHTML = showLabel
        ? `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="padding:4px 8px;border-radius:10px;background:${tierColor};color:white;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
            ₩${s.price.toLocaleString()}
          </div>
          <div style="width:8px;height:8px;background:${tierColor};transform:rotate(45deg);margin-top:-4px"></div>
          <div style="margin-top:-1px">${face}</div>
        </div>`
        : `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center">
          ${face}
        </div>`;
      content.addEventListener('click', () => onMarkerClick?.(s));
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        content, yAnchor: 1, clickable: true,
        // top10(순위 강조)은 비-top10 위에 그려지도록. 순위 높을수록 더 위로.
        zIndex: rank != null ? 10 + (11 - rank) : 1,
      });
      overlay.setMap(map);
      expOverlaysRef.current.push(overlay);
    }
  }, [ready, expOnly, expStations, mapLevel, layer, onMarkerClick]);

  // 경로별 최저가 오버레이 — routePlan이 있으면 출발→도착 직선 Polyline +
  // 출발/도착 핀 + 경로 최저가 주유소 마커를 그리고, 출발~도착이 모두 보이도록 fit한다.
  // routePlan이 null이면 모두 제거(경로 모드 해제 → 일반 지도).
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // 기존 경로 오버레이/라인 제거
    if (routeLineRef.current) { routeLineRef.current.setMap(null); routeLineRef.current = null; }
    routeOverlaysRef.current.forEach((o) => o.setMap(null));
    routeOverlaysRef.current = [];
    routeBlinkElsRef.current = new Map();
    routeStationOverlaysRef.current = new Map();
    // 기존 일반 마커에 입혔던 dedup blink 강조도 함께 정리(잔상 방지).
    routeOnMarkerElsRef.current.forEach((el) => {
      el.classList.remove('route-onmarker-blink', 'route-onmarker-blink--focus');
    });
    routeOnMarkerElsRef.current = [];

    if (!routePlan) return;

    const { from, to, stations: routeStations, path } = routePlan;
    const fromPos = new window.kakao.maps.LatLng(from.lat, from.lng);
    const toPos = new window.kakao.maps.LatLng(to.lat, to.lng);

    // (a) 경로 Polyline — 도로 경로 점들(path)을 따라 그린다.
    //     path가 없거나 부족하면 출발→도착 직선 2점으로 폴백.
    const linePath =
      Array.isArray(path) && path.length >= 2
        ? path.map((p) => new window.kakao.maps.LatLng(p.lat, p.lng))
        : [fromPos, toPos];
    const line = new window.kakao.maps.Polyline({
      path: linePath,
      strokeWeight: 5,
      strokeColor: '#2563EB',
      strokeOpacity: 0.85,
      strokeStyle: 'solid',
    });
    line.setMap(map);
    routeLineRef.current = line;

    // (b) 출발/도착 핀 — 구분되는 라벨 핀(출발=초록, 도착=빨강)
    const endpoint = (pos: kakao.maps.LatLng, label: string, name: string | undefined, color: string) => {
      const el = document.createElement('div');
      el.className = 'select-none';
      el.style.transform = 'translate(-50%, -100%)';
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center">
          <div style="padding:3px 8px;border-radius:9px;background:${color};color:#fff;font-size:11px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
            ${label}${name ? ` · ${escapeHtml(name)}` : ''}
          </div>
          <div style="width:9px;height:9px;background:${color};transform:rotate(45deg);margin-top:-5px"></div>
        </div>`;
      const ov = new window.kakao.maps.CustomOverlay({
        position: pos, content: el, yAnchor: 1, zIndex: 20,
      });
      ov.setMap(map);
      routeOverlaysRef.current.push(ov);
    };
    endpoint(fromPos, '출발', from.name, '#16A34A');
    endpoint(toPos, '도착', to.name, '#DC2626');

    // (c) 경로 최저가 주유소 마커 — 기존 마커 톤(가격 라벨 + 동심원)을 활용.
    //     가격이 쌀수록 위(낮은 순위 숫자). 클릭 시 onRouteStationClick(없으면 onMarkerClick).
    //     모든 경로 주유소의 route 오버레이를 만들되, "이미 일반 마커로 그려진" 주유소의
    //     오버레이는 아래 dedup effect가 숨기고(이중 표시 방지) 기존 마커를 펄스 강조한다.
    //     (여기서 한 번에 거르지 않는 이유: 패닝/줌으로 bbox가 바뀌어 dup 여부가 달라져도
    //      bounds 재fit 없이 dedup effect가 숨김/표시만 동기화하기 위함.)
    const thresholds = priceTierThresholds(routeStations.map((s) => s.price));
    routeStations.forEach((s, i) => {
      const rank = i + 1; // routeStations는 가격 오름차순(API 정렬)
      const tier = priceTier(s.price, thresholds);
      const tierColor = TIER_FACE[tier].color;
      const brandColor = BRAND_COLOR[s.brand] ?? '#666';
      const content = document.createElement('div');
      content.className = 'cursor-pointer select-none';
      content.style.transform = 'translate(-50%, -100%)';
      content.style.position = 'relative';
      const badge = numberMarkerSvg(tier, 28, rank, { ring: brandColor, ringWidth: 8, gap: 4 });
      // route-blink: 마커 본체 아래에 펄스 링(globals.css)을 깔아 경로 최저가 주유소를
      // 한눈에 찾게 한다. 출발/도착 핀과 구분되도록 이 마커에만 적용한다.
      content.innerHTML = `
        <div class="route-blink" style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="padding:4px 8px;border-radius:10px;background:${tierColor};color:white;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
            ₩${s.price.toLocaleString()}
          </div>
          <div style="width:8px;height:8px;background:${tierColor};transform:rotate(45deg);margin-top:-4px"></div>
          <div style="margin-top:-1px">${badge}</div>
        </div>`;
      content.addEventListener('click', () => {
        (onRouteStationClickRef.current ?? onMarkerClickRef.current)?.(s);
      });
      // 배너 강조 토글 대상(.route-blink) 등록 — id로 찾아 focus 클래스만 입힌다.
      const blinkEl = content.querySelector('.route-blink');
      if (blinkEl instanceof HTMLElement) routeBlinkElsRef.current.set(s.id, blinkEl);
      const ov = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        content, yAnchor: 1, clickable: true, zIndex: 15,
      });
      ov.setMap(map);
      routeOverlaysRef.current.push(ov);
      routeStationOverlaysRef.current.set(s.id, ov);
    });

    // (d) 출발~도착(+주유소)이 모두 보이게 bounds fit
    const bounds = new window.kakao.maps.LatLngBounds();
    for (const pos of linePath) bounds.extend(pos);
    for (const s of routeStations) bounds.extend(new window.kakao.maps.LatLng(s.lat, s.lng));
    map.setBounds(bounds);
    // setBounds는 idle을 유발 → onBoundsChange로 bbox 재조회가 이어진다(정상).
    // routePlan은 마운트/변경 시 1회만 fit하면 되므로 의존성에서 stations 등 다른 데이터는 제외.
  }, [ready, routePlan]);

  // 배너 강조 대상(highlightStationId) 변경 시, 해당 경로 마커에만 focus 강조 클래스를 토글한다.
  // 마커를 재생성하지 않으므로(=bounds 재fit 없음) 배너가 가리키는 주유소만 부드럽게 강조/해제된다.
  // routePlan 변경으로 마커가 새로 그려진 직후에도(엘리먼트 맵 갱신) 이 effect가 다시 적용한다.
  useEffect(() => {
    if (!ready) return;
    const els = routeBlinkElsRef.current;
    const ovs = routeStationOverlaysRef.current;
    for (const [id, el] of els) {
      const focused = id === highlightStationId;
      el.classList.toggle('route-blink--focus', focused);
      // 강조 마커는 다른 경로 마커(zIndex 15) 위로 올려 겹쳐도 가려지지 않게 한다.
      ovs.get(id)?.setZIndex(focused ? 18 : 15);
    }
  }, [ready, routePlan, highlightStationId]);

  // === 경로 최저가 dedup + 기존 마커 blink 강조 ===
  // 경로 최저가 주유소가 이미 일반 가격/순위 마커로 떠 있으면(routeDupIds), 그 주유소의
  // route 오버레이는 숨기고(이중 표시 제거) 기존 마커 DOM에 펄스(blink) 클래스를 입혀 강조한다.
  // 어느 일반 마커에도 없는 주유소는 route 오버레이를 그대로 보이게 둔다(기존 route-blink 포함).
  // 마커 effect들이 먼저 실행되어 [data-sid] 엘리먼트가 DOM에 존재하므로, 여기서 id로 찾아 적용한다.
  // 패닝/줌으로 마커가 재생성되거나 routePlan/highlight가 바뀌면 deps로 재실행되어 동기화된다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const container = containerRef.current;

    // 직전에 입힌 기존 마커 blink 정리(재실행 시 잔상/누수 방지).
    routeOnMarkerElsRef.current.forEach((el) => {
      el.classList.remove('route-onmarker-blink', 'route-onmarker-blink--focus');
    });
    routeOnMarkerElsRef.current = [];

    if (!routePlan || !container) {
      // 경로 모드 아님 → 모든 route 오버레이는 route effect가 이미 정리. 추가 작업 없음.
      return;
    }

    const applied: HTMLElement[] = [];
    for (const [id, ov] of routeStationOverlaysRef.current) {
      const isDup = routeDupIds.has(id);
      // dup이면 route 오버레이 숨김(이중 표시 제거), 아니면 표시.
      ov.setMap(isDup ? null : map);
      if (!isDup) continue;
      // 기존 일반 마커(data-sid) DOM을 찾아 펄스 강조 클래스를 입힌다.
      const el = container.querySelector<HTMLElement>(`[data-sid="${cssEscape(id)}"]`);
      if (!el) continue;
      el.classList.add('route-onmarker-blink');
      // 배너가 가리키는 그 주유소면 더 강한 강조(focus)도 함께.
      if (id === highlightStationId) el.classList.add('route-onmarker-blink--focus');
      applied.push(el);
    }
    routeOnMarkerElsRef.current = applied;
  }, [
    ready, routePlan, routeDupIds, highlightStationId,
    // 마커 재생성 트리거(=DOM 교체)와 동기화하기 위한 deps. 이들이 바뀌면 기존 마커가 새로
    // 그려지므로 blink를 재적용해야 한다.
    stations, top10Rank, nearbyRank, mapLevel, activeTab, areaListRank,
    nationalTop10, nearbyTop10, nearbyListRank, layer, expOnly,
  ]);

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
      // 따라가기 모드: 위치 갱신마다 줌은 유지한 채 중심만 부드럽게 이동.
      // 네비 스타일로 내 위치를 진행 방향 앞쪽으로 치우치게 두어 가는 길이 더 보이게 한다(heading 있을 때).
      panToProgrammatic(pos, true);
    }
    // follow 변화만으로는 재이동하지 않고 위치 갱신 시점에만 추적 (의도치 않은 이동 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, myLocation]);

  // 내 위치 버튼 재클릭 시(recenterSignal 증가) 명시적으로 내 위치로 이동
  useEffect(() => {
    if (!ready || !mapRef.current || !myLocation || recenterSignal === 0) return;
    const map = mapRef.current;
    map.setLevel(MY_AREA_LEVEL);
    // 따라가기 중이면 네비 오프셋(진행 방향 앞쪽 배치) 유지, 아니면 중앙.
    panToProgrammatic(new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng), followRef.current);
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

  // 네비 스타일 카메라: 따라가기(follow) 주행 중에는 내 위치를 화면 중앙이 아닌 "진행 방향 앞"
  // 쪽으로 치우치게 두어 가는 길을 더 보여준다. 가로(화면 x)는 항상 정중앙을 유지하고
  // 세로(화면 y)만 오프셋을 준다. 화면 비율 + 현재 줌(projection)을 활용해 "지도 중심"을
  // 화면 좌표 기준 위/아래로 일정 픽셀만큼 당겨 잡으므로 줌이 달라져도 화면상 비율이 일정하다.
  //
  // 이 지도는 north-up(회전 없음)이라 화면 y의 위쪽은 항상 북쪽이다. 따라서 단순히 마커를
  // 화면 하단에 고정하면 "북쪽 = 앞"일 때만 진행 방향이 보이고, 남쪽 주행 시엔 오히려 지나온
  // 뒤쪽(북)이 보인다. 이를 막기 위해 세로 오프셋의 크기/부호를 heading의 북-남 성분
  // (cos: 북=+1, 남=-1, 동/서=0)으로 보정한다. 결과적으로 북쪽 주행→마커 하단(앞=북),
  // 남쪽 주행→마커 상단(앞=남), 동/서 주행→세로 중앙(바이어스 0)이 된다.
  // NAVI_USER_VERTICAL: 진행 방향이 화면 위(북)일 때 내 위치 마커가 가는 화면 세로 비율
  // (0=최상단, 0.5=중앙, 1=최하단). 기본 0.72 → 북쪽 주행 시 마커가 화면 세로 72% 지점(하단부).
  const NAVI_USER_VERTICAL = 0.72;
  function centerForFollow(pos: kakao.maps.LatLng): kakao.maps.LatLng {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return pos;
    // 네비 모드(follow)가 아니면 오프셋 없이 중앙 배치.
    if (!followRef.current) return pos;
    const height = container.clientHeight;
    if (!height) return pos;
    // 최신 진행 방향(없으면 직전 방향 유지로 카메라 흔들림 방지). 한 번도 없으면 중앙 배치.
    const headingDeg = lastHeadingRef.current;
    if (headingDeg === null) return pos;
    // 화면 y의 위쪽 = 북쪽이므로 북-남 성분(cos)으로 오프셋 크기/부호를 보정한다.
    //  - 북쪽 주행(cos≈+1): dy<0 → 중심을 위로 당겨 마커가 화면 하단(앞=북).
    //  - 남쪽 주행(cos≈-1): dy>0 → 중심을 아래로 당겨 마커가 화면 상단(앞=남).
    //  - 동/서 주행(cos≈0): dy≈0 → 마커 세로 중앙.
    const headingRad = (headingDeg * Math.PI) / 180;
    const dy = -(NAVI_USER_VERTICAL - 0.5) * height * Math.cos(headingRad);
    try {
      const proj = map.getProjection();
      const pt = proj.containerPointFromCoords(pos);
      const shifted = new window.kakao.maps.Point(pt.x, pt.y + dy);
      return proj.coordsFromContainerPoint(shifted);
    } catch {
      // projection 미준비 등 예외 시 안전하게 중앙 배치로 폴백.
      return pos;
    }
  }

  // 프로그램적 중심 이동 — 따라가기 해제 트리거(dragstart)와 구분하기 위해 플래그를 잠깐 세운다.
  // useNaviOffset=true면 네비 스타일 오프셋(내 위치를 진행 방향 앞쪽)으로 중심을 보정한다.
  function panToProgrammatic(pos: kakao.maps.LatLng, useNaviOffset = false) {
    const map = mapRef.current;
    if (!map) return;
    programmaticMoveRef.current = true;
    map.panTo(useNaviOffset ? centerForFollow(pos) : pos);
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
