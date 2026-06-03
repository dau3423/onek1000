// 전기차 충전소 지도 마커 SVG/HTML 빌더. 주유소 마커와 형태로 구분(번개 아이콘 핀).
// 색: 사용가능 충전기 있으면 초록, 모두 사용중/점검 등은 회색. 급속 보유 시 진한 톤.

import type { EvStationMarker } from '@/types/ev';

const AVAILABLE_COLOR = '#16A34A'; // 초록 — 사용가능 충전기 있음
const BUSY_COLOR = '#9CA3AF';      // 회색 — 사용가능 없음(충전중/점검 등)

/** 충전소 마커 핀 SVG(번개 아이콘 + 사용가능/전체 숫자). size=핀 전체 높이(px). */
function evPinSvg(available: number, total: number, size: number, color: string): string {
  const w = Math.round(size * 0.74);
  const headR = w * 0.5;
  const dropPath = `M${headR} ${size} C${headR * 0.15} ${size * 0.62} 0 ${headR * 1.25} 0 ${headR} a${headR} ${headR} 0 1 1 ${w} 0 C${w} ${headR * 1.25} ${headR * 1.85} ${size * 0.62} ${headR} ${size} Z`;
  // 번개(⚡) 아이콘 — 머리 원 안에 흰색으로.
  const bw = headR * 0.7;
  const bx = headR - bw / 2;
  const by = headR - bw * 0.62;
  const bolt = `<g transform="translate(${bx} ${by}) scale(${bw / 24})">
    <path d="M13 2 L4 14 L11 14 L9 22 L20 9 L13 9 Z" fill="#ffffff" stroke="${color}" stroke-width="0.8" stroke-linejoin="round"/>
  </g>`;
  return `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="${dropPath}" fill="${color}"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.78}" fill="#ffffff"/>
    <circle cx="${headR}" cy="${headR}" r="${headR * 0.64}" fill="${color}"/>
    ${bolt}
  </svg>`;
}

/** 충전소 마커 HTML 콘텐츠 생성(라벨 포함/미포함). showLabel=줌인 시 "사용가능/전체" 라벨 노출. */
export function buildEvMarkerContent(s: EvStationMarker, showLabel: boolean): HTMLDivElement {
  const color = s.availableChargers > 0 ? AVAILABLE_COLOR : BUSY_COLOR;
  const size = showLabel ? 30 : 34;
  const pin = evPinSvg(s.availableChargers, s.totalChargers, size, color);

  const content = document.createElement('div');
  content.className = 'cursor-pointer select-none';
  content.style.transform = 'translate(-50%, -100%)';
  content.style.position = 'relative';

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
