// 주차장 지도 마커 SVG/HTML 빌더.
//
// 다른 레이어와 색·글리프로 즉시 구분한다:
//   주유소=가격 tier(적/황/녹) 숫자 · EV=초록 번개 · 세차장=청보라 · 정비소=갈색 렌치
//   렌터카=teal/violet 열쇠 · **주차장=인디고 'P'**
//
// ★ 설계 제약 3가지(design §2-3) — 어기면 이 기획의 태도가 무너진다:
//
//  1. **핀에 숫자를 넣지 않는다.** 구획수를 핀에 쓰면 잔여면수로 읽힌다. 게다가 이 앱에서
//     마커 안 숫자는 이미 주유소 가격 순위를 뜻해 의미가 충돌한다. 규모는 **크기 3단**으로만.
//  2. **초록을 쓰지 않는다.** 이 앱에서 #16A34A 는 'EV 사용가능/가격 쌈'이라 "자리 있음"으로
//     옮겨붙는다. 인디고 단일 색으로 간다.
//  3. **무료/유료는 채움 반전으로** 구분한다(무료=속 빈 P). 색상 대비가 아니라 형태 대비라
//     색각 이상에서도 갈린다.
//
// 라벨 텍스트는 여기서 만들지 않는다 — 이 모듈은 React 컴포넌트가 아니라 useTranslations 를
// 쓸 수 없다. 소비처(KakaoMap)가 번역해 label 인자로 넘긴다(렌터카·정비소와 같은 방식).

import type { ParkingMarker } from '@/types/parking';
import { parkingSizeTier, toFeeKindCode } from '@/lib/parking/labels';

/** 주차장 핀 색 — 인디고. 초록(사용가능)·적황록(유가 tier)과 겹치지 않는 계열을 골랐다. */
export const PARKING_COLOR = '#4338CA';

/** 'P' 글리프(0 0 24 24). 채움색을 인자로 받아 반전(무료=핀 색, 유료=흰색)을 만든다. */
function pGlyph(fill: string): string {
  return `<path d="M8.6 19V5h5.1a4.6 4.6 0 0 1 0 9.2H11.9" fill="none" stroke="${fill}" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * 핀 SVG. free=true 면 머리 속을 비워(흰 원 + 인디고 P) '무료'를 형태로 표시한다.
 * size=핀 전체 높이(px) — 규모 3단이 여기로 들어온다.
 */
function parkingPinSvg(size: number, free: boolean): string {
  const w = Math.round(size * 0.74);
  const headR = w * 0.5;
  const dropPath = `M${headR} ${size} C${headR * 0.15} ${size * 0.62} 0 ${headR * 1.25} 0 ${headR} a${headR} ${headR} 0 1 1 ${w} 0 C${w} ${headR * 1.25} ${headR * 1.85} ${size * 0.62} ${headR} ${size} Z`;
  const gw = headR * 0.95;
  const gx = headR - gw / 2;
  const gy = headR - gw / 2;
  // 무료: 머리 속이 흰색이고 P 가 인디고 / 유료: 머리 속이 인디고이고 P 가 흰색.
  const innerFill = free ? '#ffffff' : PARKING_COLOR;
  const glyphFill = free ? PARKING_COLOR : '#ffffff';
  const glyph = `<g transform="translate(${gx} ${gy}) scale(${gw / 24})">${pGlyph(glyphFill)}</g>`;
  return `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="${dropPath}" fill="${PARKING_COLOR}"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.80}" fill="#ffffff"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.66}" fill="${innerFill}"/>
    ${glyph}
  </svg>`;
}

/** 규모 3단 → 핀 높이(px). 라벨이 있으면 전체적으로 조금 낮춘다(렌터카와 같은 규칙). */
const PIN_HEIGHT = { sm: 28, md: 32, lg: 38 } as const;

/**
 * 주차장 마커 HTML 콘텐츠 생성.
 * showLabel=줌인 시 라벨 노출. label=호출부가 번역해 넘긴 텍스트(기본요금 또는 무료/유료).
 *
 * 좌표 기준점: 라벨이 흐름 안에 있어 콘텐츠 박스의 '아래 끝' = 핀 끝이다.
 * 그래서 오버레이는 yAnchor:1 로 붙인다. 여기에 CSS transform 을 걸면 앵커 보정이
 * 이중 적용되므로 절대 넣지 않는다(정비소·세차장·렌터카 마커와 동일 규칙).
 */
export function buildParkingMarkerContent(
  place: ParkingMarker, showLabel: boolean, label: string,
): HTMLDivElement {
  const free = toFeeKindCode(place.feeKind) === 'free';
  const tier = parkingSizeTier(place.capacity);
  const size = PIN_HEIGHT[tier] - (showLabel ? 3 : 0);
  const pin = parkingPinSvg(size, free);

  const content = document.createElement('div');
  content.className = 'cursor-pointer select-none';
  content.style.position = 'relative';
  // 큰 주차장을 위로 — 겹칠 때 규모가 큰 쪽이 보이는 게 유용하다(상한 절단 기준과 같은 논리).
  content.style.zIndex = tier === 'lg' ? '3' : tier === 'md' ? '2' : '1';

  content.innerHTML = showLabel
    ? `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="padding:3px 8px;border-radius:10px;background:${PARKING_COLOR};color:white;font-size:11px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
          ${label}
        </div>
        <div style="width:8px;height:8px;background:${PARKING_COLOR};transform:rotate(45deg);margin-top:-4px"></div>
        <div style="margin-top:-1px">${pin}</div>
      </div>`
    : `<div style="display:flex;justify-content:center">${pin}</div>`;
  return content;
}
