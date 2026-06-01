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
 * tier 색 원 배경 + 표정으로 이루어진 완성된 마커 얼굴 SVG 문자열.
 * - size: 한 변(px). 작은 값에서도 표정이 식별되도록 stroke가 viewBox 기준이라 자동 스케일.
 * - ring/ringWidth: 테두리(브랜드 색). 미지정 시 테두리 없음.
 */
export function faceMarkerSvg(
  tier: PriceTier,
  size: number,
  opts: { ring?: string; ringWidth?: number } = {},
): string {
  const { color } = TIER_FACE[tier];
  const ring = opts.ring;
  const ringWidth = opts.ringWidth ?? 0;
  // 테두리가 안쪽으로 먹지 않도록 반지름을 살짝 줄인다.
  const r = 46 - ringWidth;
  const ringAttr = ring && ringWidth > 0 ? ` stroke="${ring}" stroke-width="${ringWidth * 2}"` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.3))">
    <circle cx="50" cy="50" r="${r}" fill="${color}"${ringAttr}/>
    ${faceSvgInner(tier)}
  </svg>`;
}
