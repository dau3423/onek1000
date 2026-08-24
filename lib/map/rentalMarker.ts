// 렌터카 지도 마커 SVG/HTML 빌더.
//
// 다른 레이어와 색·글리프로 즉시 구분한다:
//   주유소=가격 tier(적/황/녹) 표정·숫자 · EV=초록 번개 · 세차장=청보라 물/스펀지 · 정비소=갈색 렌치
//   렌터카=teal(기본) / violet(전기차 보유) + 열쇠 글리프
//
// 라벨 텍스트는 여기서 만들지 않는다 — 이 모듈은 React 컴포넌트가 아니라 useTranslations 를
// 쓸 수 없다. 소비처(KakaoMap)가 번역해 label 인자로 넘긴다(repairMarker.ts 와 같은 방식).

import type { RentalMarker } from '@/types/rental';
import { RENTAL_COLOR, RENTAL_EV_COLOR } from '@/types/rental';

/** 열쇠 글리프(0 0 24 24) — 차를 '빌린다'는 행위를 가장 직관적으로 나타낸다. */
const KEY_GLYPH =
  '<path d="M14.5 3.5a6 6 0 0 0-5.7 7.9L3 17.2V21h3.8l1.2-1.2v-1.9h1.9l1.2-1.2v-1.9h1.9l1.6-1.6a6 6 0 0 0 5.9-9.7 6 6 0 0 0-6-0zm2.4 3.1a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z" fill="#fff"/>';

/** 전기차 보유 표시 — 열쇠 대신 번개를 얹지 않고, 열쇠 옆 작은 배지로 붙인다(열쇠=렌터카 정체성 유지). */
const BOLT_BADGE =
  '<path d="M13 2 4.5 13.5H11L9.5 22 18.5 10H12L13 2z" fill="#fff"/>';

/** 렌터카 마커 핀 SVG(물방울 핀 + 열쇠). size=핀 전체 높이(px). */
function rentalPinSvg(size: number, color: string, hasEv: boolean): string {
  const w = Math.round(size * 0.74);
  const headR = w * 0.5;
  const dropPath = `M${headR} ${size} C${headR * 0.15} ${size * 0.62} 0 ${headR * 1.25} 0 ${headR} a${headR} ${headR} 0 1 1 ${w} 0 C${w} ${headR * 1.25} ${headR * 1.85} ${size * 0.62} ${headR} ${size} Z`;
  const gw = headR * 0.95;
  const gx = headR - gw / 2;
  const gy = headR - gw / 2;
  const glyph = `<g transform="translate(${gx} ${gy}) scale(${gw / 24})">${hasEv ? BOLT_BADGE : KEY_GLYPH}</g>`;
  return `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="${dropPath}" fill="${color}"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.80}" fill="#ffffff"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.66}" fill="${color}"/>
    ${glyph}
  </svg>`;
}

/**
 * 렌터카 마커 HTML 콘텐츠 생성.
 * showLabel=줌인 시 라벨 노출. label=호출부가 이미 번역해 넘긴 텍스트(요금 또는 업체 규모).
 *
 * 좌표 기준점: 라벨이 흐름 안에 있어 콘텐츠 박스의 '아래 끝' = 핀 끝이다.
 * 그래서 오버레이는 yAnchor:1 로 붙인다. 여기에 CSS transform 을 걸면 앵커 보정이
 * 이중 적용되므로 절대 넣지 않는다(정비소·세차장 마커와 동일 규칙).
 */
export function buildRentalMarkerContent(place: RentalMarker, showLabel: boolean, label: string): HTMLDivElement {
  const hasEv = place.evCars > 0;
  // 전기차 보유 업체를 다른 색으로 — 소수라서 무리 속에서 도드라져야 필터 없이도 찾을 수 있다.
  const color = hasEv ? RENTAL_EV_COLOR : RENTAL_COLOR;
  const size = (showLabel ? 30 : 34) + (hasEv ? 4 : 0);
  const pin = rentalPinSvg(size, color, hasEv);

  const content = document.createElement('div');
  content.className = 'cursor-pointer select-none';
  content.style.position = 'relative';
  // 전기차 보유 업체를 위로 올려 겹칠 때 우선 보이게 한다.
  content.style.zIndex = hasEv ? '3' : '2';

  content.innerHTML = showLabel
    ? `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="padding:3px 8px;border-radius:10px;background:${color};color:white;font-size:11px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
          ${label}
        </div>
        <div style="width:8px;height:8px;background:${color};transform:rotate(45deg);margin-top:-4px"></div>
        <div style="margin-top:-1px">${pin}</div>
      </div>`
    : `<div style="display:flex;justify-content:center">${pin}</div>`;
  return content;
}
