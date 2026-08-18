// 독립 세차장 지도 마커 SVG/HTML 빌더. 주유소(표정/숫자)·EV(초록 번개)와 색·글리프로 즉시 구분.
// 유형별 색(design §2-3) + 머리 원 안 흰색 유형 글리프(셀프=물방울 / 손세차=스펀지 거품 /
// 자동=기어 / 미확인=?). 물방울 핀 실루엣은 EV와 같으나 색/글리프가 완전히 다르다.

import type { CarwashMarker, WashType } from '@/types/carwash';
import { WASH_TYPE_COLOR } from '@/types/carwash';

// 줌인(level ≤ 6) 라벨 텍스트(셀프세차/손세차/자동세차/세차장)는 여기 두지 않는다.
// 이 모듈은 React 컴포넌트가 아니라 useTranslations를 쓸 수 없으므로, messages/{locale}.json의
// map.carwashMarkerLabel.<type>으로 옮기고 소비처(KakaoMap)가 유형 코드로 직접 번역해
// buildCarwashMarkerContent에 label 인자로 넘긴다(markerFace.ts·ev/format.ts와 같은 방식).

/** 유형별 흰색 글리프(0 0 24 24 좌표계). 머리 원 안에 스케일해 얹는다. */
function glyphSvg(type: WashType): string {
  switch (type) {
    case 'self': // 물방울(셀프=물 분사)
      return '<path d="M12 4c2.6 3.4 4.5 5.8 4.5 8.2a4.5 4.5 0 0 1-9 0C7.5 9.8 9.4 7.4 12 4z" fill="#fff"/>';
    case 'hand': // 스펀지 + 거품(손세차)
      return '<rect x="6.5" y="10.5" width="11" height="7" rx="1.6" fill="#fff"/>'
        + '<circle cx="9" cy="7.6" r="1.3" fill="#fff"/><circle cx="12.5" cy="6.4" r="1.6" fill="#fff"/><circle cx="16" cy="7.9" r="1.2" fill="#fff"/>';
    case 'auto': // 기어(자동·기계식)
      return '<circle cx="12" cy="12" r="5" fill="none" stroke="#fff" stroke-width="2.4"/>'
        + '<circle cx="12" cy="12" r="1.7" fill="#fff"/>'
        + '<g fill="#fff"><rect x="11" y="4.2" width="2" height="2.6"/><rect x="11" y="17.2" width="2" height="2.6"/>'
        + '<rect x="4.2" y="11" width="2.6" height="2"/><rect x="17.2" y="11" width="2.6" height="2"/></g>';
    default: // 미확인
      return '<text x="12" y="12.5" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="800" fill="#fff">?</text>';
  }
}

/** 세차장 마커 핀 SVG(물방울 핀 + 유형 글리프). size=핀 전체 높이(px). */
function carwashPinSvg(size: number, color: string, type: WashType): string {
  const w = Math.round(size * 0.74);
  const headR = w * 0.5;
  const dropPath = `M${headR} ${size} C${headR * 0.15} ${size * 0.62} 0 ${headR * 1.25} 0 ${headR} a${headR} ${headR} 0 1 1 ${w} 0 C${w} ${headR * 1.25} ${headR * 1.85} ${size * 0.62} ${headR} ${size} Z`;
  const gw = headR * 0.95;
  const gx = headR - gw / 2;
  const gy = headR - gw / 2;
  const glyph = `<g transform="translate(${gx} ${gy}) scale(${gw / 24})">${glyphSvg(type)}</g>`;
  return `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="${dropPath}" fill="${color}"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.80}" fill="#ffffff"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.66}" fill="${color}"/>
    ${glyph}
  </svg>`;
}

/** 세차장 마커 HTML 콘텐츠 생성. showLabel=줌인(level ≤ 6) 시 유형 라벨 노출.
 *  label=이미 번역된 유형 라벨 텍스트(호출부가 map.carwashMarkerLabel.<type>로 번역해 전달). */
export function buildCarwashMarkerContent(place: CarwashMarker, showLabel: boolean, label: string): HTMLDivElement {
  const type = place.washType;
  const color = WASH_TYPE_COLOR[type];
  const size = showLabel ? 30 : 34;
  const pin = carwashPinSvg(size, color, type);

  const content = document.createElement('div');
  content.className = 'cursor-pointer select-none';
  content.style.transform = 'translate(-50%, -100%)';
  content.style.position = 'relative';
  // 미확인(회색)은 살짝 아래로, 유형 확정 핀을 위로 올려 겹칠 때 우선 보이게 한다.
  content.style.zIndex = type === 'unknown' ? '1' : '2';

  const html = showLabel
    ? `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="padding:3px 8px;border-radius:10px;background:${color};color:white;font-size:11px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
          ${label}
        </div>
        <div style="width:8px;height:8px;background:${color};transform:rotate(45deg);margin-top:-4px"></div>
        <div style="margin-top:-1px">${pin}</div>
      </div>`
    : `<div style="display:flex;justify-content:center">${pin}</div>`;
  content.innerHTML = html;
  return content;
}
