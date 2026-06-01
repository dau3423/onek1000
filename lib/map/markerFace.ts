// 가격 tier → 색/라벨/표정 매핑 (단일 출처)
//
// 지도 마커(KakaoMap)와 범례(MarkerLegend)가 같은 표를 공유해 표정·색·라벨이
// 항상 일치하도록 한다. 표정은 OS별 모양 차이가 없도록 이모지 대신 인라인 SVG로
// 그린다(추후 PNG 에셋으로 교체하기 쉽게 SVG 문자열 생성 함수로 분리).
//
// tier 색 역할은 기존과 동일: 저렴 초록 / 보통 노랑 / 비쌈 빨강.

import type { PriceTier } from './geo';

export interface TierFaceMeta {
  /** 마커 안쪽 채움 색(가격 tier 색). 기존 KakaoMap 상수와 동일. */
  color: string;
  /** 범례/안내용 라벨. */
  label: string;
  /** 요청 사양의 표현 라벨(좋음/보통/매우 나쁨). */
  mood: string;
  /** 화면 내 상대 위치 보조 설명. */
  hint: string;
}

export const TIER_FACE: Record<PriceTier, TierFaceMeta> = {
  cheap: { color: '#16A34A', label: '좋음', mood: '좋음', hint: '싼 편 (하위권)' },
  normal: { color: '#EAB308', label: '보통', mood: '보통', hint: '보통 (중간권)' },
  expensive: { color: '#DC2626', label: '매우 나쁨', mood: '매우 나쁨', hint: '비싼 편 (상위권)' },
};

/**
 * tier별 얼굴 표정을 그리는 SVG 경로(눈/입)를 반환한다.
 * - cheap(좋음): 하트 눈 + 큰 웃음 😍
 * - normal(보통): 점 눈 + 가로 입(무표정에 가까운 미소) 🙂
 * - expensive(매우 나쁨): 찡그린 눈썹 + 아래로 굽은 입 😠
 *
 * viewBox는 항상 0 0 100 100(원 중심 50,50 / 반지름 ~46). 호출부에서 크기를 조절한다.
 * stroke 색은 배경(tier 색) 대비를 위해 흰색 고정 — 작은 마커에서도 식별되게 굵게 그린다.
 */
export function faceSvgInner(tier: PriceTier): string {
  const S = '#ffffff'; // 표정 선/채움 색(배경 대비 흰색)
  switch (tier) {
    case 'cheap':
      // 하트 눈 2개 + 활짝 웃는 입
      return `
        <path d="M30 34 c-4-6-13-5-13 2 0 5 7 9 13 13 6-4 13-8 13-13 0-7-9-8-13-2Z" fill="${S}"/>
        <path d="M70 34 c-4-6-13-5-13 2 0 5 7 9 13 13 6-4 13-8 13-13 0-7-9-8-13-2Z" fill="${S}"/>
        <path d="M32 62 a20 20 0 0 0 36 0" fill="none" stroke="${S}" stroke-width="8" stroke-linecap="round"/>`;
    case 'normal':
      // 점 눈 2개 + 가로 입(차분한 미소)
      return `
        <circle cx="34" cy="42" r="6" fill="${S}"/>
        <circle cx="66" cy="42" r="6" fill="${S}"/>
        <path d="M34 64 q16 8 32 0" fill="none" stroke="${S}" stroke-width="7" stroke-linecap="round"/>`;
    case 'expensive':
      // 찡그린 눈썹 + 아래로 굽은 입(화남)
      return `
        <path d="M24 34 l18 8" stroke="${S}" stroke-width="7" stroke-linecap="round"/>
        <path d="M76 34 l-18 8" stroke="${S}" stroke-width="7" stroke-linecap="round"/>
        <circle cx="35" cy="50" r="5.5" fill="${S}"/>
        <circle cx="65" cy="50" r="5.5" fill="${S}"/>
        <path d="M34 70 q16 -12 32 0" fill="none" stroke="${S}" stroke-width="7" stroke-linecap="round"/>`;
  }
}

/**
 * 배경(채움) 색 위 텍스트 대비 — 밝은 배경(예: 노랑)엔 검정, 어두운 배경엔 흰색.
 * hex(#RRGGBB) → 상대 휘도 근사. 숫자 마커 가독성(흰/검정 대비) 확보용.
 */
export function readableTextColor(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1f2937' : '#ffffff';
}

/**
 * faceMarkerSvg와 동일한 동심원 구조(브랜드 테두리 → 흰 간격 → tier 얼굴 원)를 그리되,
 * 안쪽 내용(표정 또는 순위 숫자)만 inner 인자로 받아 합성하는 공통 헬퍼.
 * - inner: viewBox 0 0 100 100 좌표계의 SVG 조각(표정 경로 또는 <text>).
 */
function circleMarkerSvg(
  tier: PriceTier,
  size: number,
  inner: string,
  opts: { ring?: string; ringWidth?: number; gap?: number } = {},
): string {
  const { color } = TIER_FACE[tier];
  const ring = opts.ring;
  const ringWidth = opts.ringWidth ?? 0;
  const gap = opts.gap ?? 0;
  const hasRing = !!ring && ringWidth > 0;

  // viewBox 100 기준 외곽 반지름(약간 여유). 바깥부터 브랜드 테두리 → 흰 간격 → 얼굴 순.
  const outerR = 48;
  // 얼굴(tier 색) 반지름: 외곽에서 브랜드 두께 + 흰 간격을 뺀 값.
  const faceR = hasRing ? outerR - ringWidth - gap : outerR;
  // 흰 간격 링 반지름(브랜드 안쪽). gap이 0이면 흰 링은 그리지 않는다.
  const gapR = outerR - ringWidth;

  const brandLayer = hasRing
    ? `<circle cx="50" cy="50" r="${outerR}" fill="${ring}"/>`
    : '';
  const gapLayer = hasRing && gap > 0
    ? `<circle cx="50" cy="50" r="${gapR}" fill="#ffffff"/>`
    : '';

  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.3))">
    ${brandLayer}
    ${gapLayer}
    <circle cx="50" cy="50" r="${faceR}" fill="${color}"/>
    ${inner}
  </svg>`;
}

/**
 * tier 색 원 배경 + 표정으로 이루어진 완성된 마커 얼굴 SVG 문자열.
 * - size: 한 변(px). 작은 값에서도 표정이 식별되도록 stroke가 viewBox 기준이라 자동 스케일.
 * - ring/ringWidth: 바깥 브랜드 테두리 색/두께(viewBox 100 기준). 미지정 시 테두리 없음.
 * - gap: 얼굴(tier 색)과 브랜드 테두리 사이 흰색 간격 두께(viewBox 100 기준). 기본 0.
 *
 * 구조(바깥→안): 브랜드색 원 → 흰색 간격 → tier색 얼굴 원 → 표정.
 * 동심원을 겹쳐 그려 "얼굴 — 흰 링 — 두꺼운 브랜드 테두리"가 또렷하게 분리되어 보인다.
 */
export function faceMarkerSvg(
  tier: PriceTier,
  size: number,
  opts: { ring?: string; ringWidth?: number; gap?: number } = {},
): string {
  return circleMarkerSvg(tier, size, faceSvgInner(tier), opts);
}

/**
 * faceMarkerSvg와 동일 구조의 마커에 "표정 대신 가격 순위 숫자"를 그린 SVG 문자열.
 * BottomSheet 활성 탭 목록의 가격순 순위(1=가장 쌈)를 지도 마커에 그대로 표시해
 * 목록 항목과 마커를 숫자로 매칭할 수 있게 한다.
 * - 숫자 색은 tier 색(안쪽 배경) 대비에 맞춰(흰/검정) 가독성을 확보한다.
 * - 색·간격·테두리 구조는 faceMarkerSvg와 동일.
 */
export function numberMarkerSvg(
  tier: PriceTier,
  size: number,
  rank: number,
  opts: { ring?: string; ringWidth?: number; gap?: number } = {},
): string {
  const txt = readableTextColor(TIER_FACE[tier].color);
  // 두 자리(10 등)는 한 자리보다 작게 그려 원 안에 들어오게 한다.
  const fontSize = rank >= 10 ? 46 : 56;
  const inner = `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="800" fill="${txt}" font-family="system-ui,-apple-system,sans-serif">${rank}</text>`;
  return circleMarkerSvg(tier, size, inner, opts);
}
