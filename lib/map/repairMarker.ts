// 자동차 정비소 지도 마커 SVG/HTML 빌더.
// 주유소(표정/숫자)·EV(초록 번개)·세차장(블루 계열 + 물/스펀지/기어)과 색·글리프로 즉시 구분한다.
// 정비소는 갈색~적갈 계열 + 스패너/렌치 글리프. 세차장의 '기어'(자동세차)와 혼동되지 않도록
// 정비소는 기어를 쓰지 않고 스패너 계열로만 표현한다.

import type { RepairBrand, RepairMarker, RepairShopType } from '@/types/repair';
import { REPAIR_BRAND_COLOR, REPAIR_TYPE_COLOR } from '@/types/repair';

// 줌인(level ≤ 6) 라벨 텍스트는 여기 두지 않는다 — 이 모듈은 React 컴포넌트가 아니라
// useTranslations 를 쓸 수 없다. messages/{locale}.json 의 map.repairMarkerLabel.<type> 을
// 소비처(KakaoMap)가 번역해 label 인자로 넘긴다(carwashMarker.ts 와 같은 방식).

/**
 * 브랜드별 흰색 글리프. 브랜드가 있으면 유형 글리프 대신 이걸 쓴다 —
 * 같은 '카센터(specialty)' 라도 오토큐와 무소속은 한눈에 달라야 한다는 요구에서 나왔다.
 * 로고를 쓰지 않는다(상표권). 각 사를 떠올리게 하는 짧은 이니셜/심볼로만 구분한다.
 */
function brandGlyphSvg(brand: RepairBrand): string {
  const txt = (t: string, size = 11) =>
    `<text x="12" y="12.5" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="800" fill="#fff" font-family="system-ui,-apple-system,sans-serif">${t}</text>`;
  switch (brand) {
    case 'autoq': return txt('Q', 14);
    case 'bluehands': return txt('H', 14);
    case 'speedmate': return txt('SK', 10);
    case 'renault': return txt('R', 14);
    case 'autooasis': return txt('OA', 10);
    case 'kgm': return txt('KG', 10);
    case 'chevrolet': return txt('GM', 10);
    case 'carpos': return txt('CP', 10);
    case 'gongim': return txt('GN', 10);
    case 'tire': return '<circle cx="12" cy="12" r="8.5" fill="none" stroke="#fff" stroke-width="3"/><circle cx="12" cy="12" r="3" fill="#fff"/>';  // 타이어 = 도넛
    case 'inspection': return '<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>';  // 검사 = 합격 체크
    case 'imported': return txt('IM', 10);
  }
}

/** 유형별 흰색 글리프(0 0 24 24 좌표계). 머리 원 안에 스케일해 얹는다. */
function glyphSvg(type: RepairShopType): string {
  switch (type) {
    case 'general': // 종합(1급) — 렌치 + 드라이버 교차(할 수 있는 정비 범위가 넓다)
      return '<path d="M14.7 3.6a4.6 4.6 0 0 0-5.5 5.9L3.6 15.1a1.9 1.9 0 1 0 2.7 2.7l5.6-5.6a4.6 4.6 0 0 0 5.9-5.5l-2.7 2.7-2.6-.7-.7-2.6z" fill="#fff"/>'
        + '<rect x="14.4" y="13.2" width="2.3" height="7.6" rx="1.1" transform="rotate(-45 15.5 17)" fill="#fff"/>';
    case 'small': // 소형(2급) — 렌치 1개
      return '<path d="M15.2 3.4a4.9 4.9 0 0 0-5.9 6.2L3.5 15.4a2 2 0 1 0 2.9 2.9l5.8-5.8a4.9 4.9 0 0 0 6.2-5.9l-2.9 2.9-2.8-.8-.8-2.8z" fill="#fff"/>';
    case 'specialty': // 전문(카센터) — 스패너(양끝 오픈) : 실데이터의 약 79%라 가장 눈에 익어야 한다
      return '<path d="M6.4 4.2 8.9 6.7 7.5 8.1 5 5.6a3.6 3.6 0 0 0 4.6 4.6l7.3 7.3a1.9 1.9 0 1 0 2.7-2.7l-7.3-7.3A3.6 3.6 0 0 0 8.7 3l-2.3 1.2z" fill="#fff"/>';
    case 'engine': // 원동기 — 피스톤
      return '<rect x="9" y="3.6" width="6" height="7.2" rx="1.2" fill="#fff"/>'
        + '<rect x="10.7" y="10.8" width="2.6" height="5.2" fill="#fff"/>'
        + '<rect x="7.4" y="16" width="9.2" height="4.4" rx="1.4" fill="#fff"/>';
    default: // 미확인
      return '<text x="12" y="12.5" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="800" fill="#fff">?</text>';
  }
}

/** 정비소 마커 핀 SVG(물방울 핀 + 유형 글리프). size=핀 전체 높이(px). */
function repairPinSvg(size: number, color: string, type: RepairShopType, brand: RepairBrand | null): string {
  const w = Math.round(size * 0.74);
  const headR = w * 0.5;
  const dropPath = `M${headR} ${size} C${headR * 0.15} ${size * 0.62} 0 ${headR * 1.25} 0 ${headR} a${headR} ${headR} 0 1 1 ${w} 0 C${w} ${headR * 1.25} ${headR * 1.85} ${size * 0.62} ${headR} ${size} Z`;
  const gw = headR * 0.95;
  const gx = headR - gw / 2;
  const gy = headR - gw / 2;
  const inner = brand ? brandGlyphSvg(brand) : glyphSvg(type);
  const glyph = `<g transform="translate(${gx} ${gy}) scale(${gw / 24})">${inner}</g>`;
  return `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="${dropPath}" fill="${color}"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.80}" fill="#ffffff"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.66}" fill="${color}"/>
    ${glyph}
  </svg>`;
}

/**
 * 정비소 마커 HTML 콘텐츠 생성. showLabel=줌인(level ≤ 6) 시 유형 라벨 노출.
 * label=이미 번역된 유형 라벨 텍스트(호출부가 map.repairMarkerLabel.<type> 로 번역해 전달).
 *
 * 좌표 기준점: 라벨이 흐름 안에 있어 콘텐츠 박스의 '아래 끝' = 핀 끝이다.
 * 그래서 오버레이는 yAnchor:1 로 붙인다(3541182 에서 정리한 규칙 — 꼬리 있는 핀은 아래 끝이 좌표).
 * 여기에 CSS transform 을 걸면 앵커 보정이 이중 적용되므로 절대 넣지 않는다.
 */
export function buildRepairMarkerContent(shop: RepairMarker, showLabel: boolean, label: string): HTMLDivElement {
  const type = shop.shopType;
  const brand = shop.brand ?? null;
  // 브랜드가 있으면 브랜드 색, 없으면(94%) 기존 유형 갈색 톤.
  // 이렇게 해야 소수인 브랜드 지점이 무소속 무리 속에서 도드라진다.
  const color = brand ? REPAIR_BRAND_COLOR[brand] : REPAIR_TYPE_COLOR[type];
  // 브랜드 지점은 조금 크게 그려 한 번 더 눈에 띄게 한다.
  const size = (showLabel ? 30 : 34) + (brand ? 4 : 0);
  const pin = repairPinSvg(size, color, type, brand);

  const content = document.createElement('div');
  content.className = 'cursor-pointer select-none';
  content.style.position = 'relative';
  // 미확인(회색)은 아래로, 유형 확정 핀을 위로 올려 겹칠 때 우선 보이게 한다.
  // 브랜드 지점 > 유형 확정 > 미확인 순으로 겹칠 때 위에 오게 한다.
  content.style.zIndex = brand ? '3' : type === 'unknown' ? '1' : '2';

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
