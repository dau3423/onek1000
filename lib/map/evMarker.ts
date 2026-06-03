// 전기차 충전소 지도 마커 SVG/HTML 빌더. 주유소 마커와 형태로 구분(번개 아이콘 핀).
// 색: 사용가능 충전기 있으면 초록, 모두 사용중/점검 등은 회색.
// 충전소엔 단가가 없으므로 마커는 "사용가능 여부 + 급속 보유"를 시각적으로 강조한다.
//  - 사용가능(available>0): 진한 초록 + 약간 큰 핀(강조).
//  - 불가(전부 충전중/점검/통신이상): 회색 + 살짝 작게(약화).
//  - 급속 보유: 핀 머리 우상단에 번개 뱃지(노란 원)를 덧붙여 한눈에 구분.

import type { EvStationMarker } from '@/types/ev';

const AVAILABLE_COLOR = '#16A34A'; // 초록 — 사용가능 충전기 있음(강조)
const BUSY_COLOR = '#9CA3AF';      // 회색 — 사용가능 없음(충전중/점검 등, 약화)
const FAST_BADGE_COLOR = '#F59E0B'; // 앰버 — 급속 보유 뱃지

/** 급속 보유 뱃지(핀 머리 우상단의 작은 번개 원). cx/cy=뱃지 중심, r=반지름. */
function fastBadgeSvg(cx: number, cy: number, r: number): string {
  const bw = r * 1.1;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${FAST_BADGE_COLOR}" stroke="#ffffff" stroke-width="${r * 0.28}"/>
    <g transform="translate(${cx - bw / 2} ${cy - bw / 2}) scale(${bw / 24})">
      <path d="M13 2 L4 14 L11 14 L9 22 L20 9 L13 9 Z" fill="#ffffff"/>
    </g>`;
}

/** 충전소 마커 핀 SVG(번개 아이콘 + 급속 뱃지). size=핀 전체 높이(px). hasFast=급속 뱃지 표시. */
function evPinSvg(size: number, color: string, hasFast: boolean): string {
  const w = Math.round(size * 0.74);
  const headR = w * 0.5;
  // 급속 뱃지가 머리 우상단 밖으로 튀어나가므로 viewBox 상/우에 여유를 둔다.
  const badgeR = w * 0.24;
  const padTop = hasFast ? Math.ceil(badgeR) : 0;
  const padRight = hasFast ? Math.ceil(badgeR) : 0;
  const dropPath = `M${headR} ${size} C${headR * 0.15} ${size * 0.62} 0 ${headR * 1.25} 0 ${headR} a${headR} ${headR} 0 1 1 ${w} 0 C${w} ${headR * 1.25} ${headR * 1.85} ${size * 0.62} ${headR} ${size} Z`;
  // 번개(⚡) 아이콘 — 머리 원 안에 흰색으로.
  const bw = headR * 0.7;
  const bx = headR - bw / 2;
  const by = headR - bw * 0.62;
  const bolt = `<g transform="translate(${bx} ${by}) scale(${bw / 24})">
    <path d="M13 2 L4 14 L11 14 L9 22 L20 9 L13 9 Z" fill="#ffffff" stroke="${color}" stroke-width="0.8" stroke-linejoin="round"/>
  </g>`;
  const fastBadge = hasFast ? fastBadgeSvg(w - badgeR * 0.5, badgeR * 0.5, badgeR) : '';
  const vbW = w + padRight;
  const vbH = size + padTop;
  return `<svg width="${vbW}" height="${vbH}" viewBox="0 ${-padTop} ${vbW} ${vbH}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="${dropPath}" fill="${color}"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.78}" fill="#ffffff"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.64}" fill="${color}"/>
    ${bolt}
    ${fastBadge}
  </svg>`;
}

/** 충전소 마커 HTML 콘텐츠 생성(라벨 포함/미포함). showLabel=줌인 시 "사용가능/전체" 라벨 노출. */
export function buildEvMarkerContent(s: EvStationMarker, showLabel: boolean): HTMLDivElement {
  const available = s.availableChargers > 0;
  const color = available ? AVAILABLE_COLOR : BUSY_COLOR;
  // 사용가능은 강조(크게), 불가는 약화(작게). 라벨 줌에서는 라벨이 있어 핀을 조금 작게 둔다.
  const size = showLabel ? (available ? 32 : 28) : (available ? 36 : 32);
  const pin = evPinSvg(size, color, s.hasFast);

  const content = document.createElement('div');
  content.className = 'cursor-pointer select-none';
  content.style.transform = 'translate(-50%, -100%)';
  content.style.position = 'relative';
  // 사용가능 핀은 약간 위로(z) 올려 겹칠 때 우선 보이게 한다.
  content.style.zIndex = available ? '2' : '1';

  const label = showLabel
    ? `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="padding:3px 8px;border-radius:10px;background:${color};color:white;font-size:11px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">
          ${s.availableChargers}/${s.totalChargers}대${s.hasFast ? ' · 급속' : ''}
        </div>
        <div style="width:8px;height:8px;background:${color};transform:rotate(45deg);margin-top:-4px"></div>
        <div style="margin-top:-1px">${pin}</div>
      </div>`
    : `<div style="display:flex;justify-content:center">${pin}</div>`;
  content.innerHTML = label;
  return content;
}
