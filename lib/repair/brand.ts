// 정비소 브랜드(체인·공식 서비스망) 판별 — 업체명 문자열에서 추론한다.
//
// 왜 추론인가: 「전국자동차정비업체표준데이터」에는 브랜드 필드가 없다. 있는 건 업체명뿐이라
// 이름에서 찾는 수밖에 없다. 그래서 **오탐을 만들지 않는 것**이 이 모듈의 유일한 설계 목표다.
//
// 실측(2026-08, 34,172행)에서 배운 것:
//  - '현대' 로 검색하면 2,056건이 나오지만 대부분 `현대모터스`·`사동현대써비스` 같은
//    **상호에 '현대'가 들어간 동네 정비소**다. 현대차 공식망은 '블루핸즈' 74건뿐이다.
//    → 제조사 이름 단독('현대','기아','삼성')은 절대 브랜드 판별에 쓰지 않는다.
//      쓰면 "현대 공식 정비소"로 오해를 만든다.
//  - 반대로 체인 고유명(오토큐/블루핸즈/스피드메이트/오토오아시스/카포스)은 그 자체로 고유해
//    오탐이 사실상 없다.
//  - 공백·괄호·(주)·㈜ 가 제각각이라(`우동점기아오토큐주식회사`, `기아오토큐 흑석점`)
//    비교 전에 공백과 법인격 표기를 제거한다.

import type { RepairBrand } from '@/types/repair';

/** 비교용 정규화 — 공백/괄호/법인격 표기를 지우고 소문자로. */
function canon(name: string): string {
  return name
    .replace(/\(주\)|\(株\)|㈜|주식회사|유한회사|\(유\)|합자회사/g, '')
    .replace(/[\s()［］\[\]·・.,'"`-]/g, '')
    .toLowerCase();
}

/**
 * 브랜드별 판별 키워드(정규화된 문자열 기준, 순서 = 우선순위).
 * 앞에 있는 규칙이 먼저 이긴다 — 한 이름에 둘이 걸릴 때를 위해서다
 * (예: `르노코리아서비스코너김천점 애니카랜드김천점` 은 르노가 먼저 잡힌다).
 */
const RULES: { brand: RepairBrand; keywords: string[] }[] = [
  // ── 완성차 공식 서비스망 ──
  { brand: 'autoq', keywords: ['기아오토큐', '오토큐'] },
  { brand: 'bluehands', keywords: ['블루핸즈'] },
  { brand: 'chevrolet', keywords: ['쉐보레', 'chevrolet', 'gm대우', '대우자동차바로정비'] },
  { brand: 'renault', keywords: ['르노코리아', '르노삼성', '르노자동차'] },
  { brand: 'kgm', keywords: ['kg모빌리티', '쌍용자동차', '쌍용서비스', '쌍용모터스'] },
  // ── 수입차(개별 건수가 적어 하나로 묶는다) ──
  {
    brand: 'imported',
    keywords: [
      'bmw', '비엠떠블유', '벤츠', 'benz', '아우디', 'audi', '폭스바겐', 'volkswagen',
      '테슬라', 'tesla', '토요타', 'toyota', '렉서스', 'lexus', '혼다', 'honda',
      '볼보', 'volvo', '포드', 'ford', '푸조', 'peugeot', '재규어', '랜드로버', '포르쉐', 'porsche',
    ],
  },
  // ── 정유사·부품 체인 ──
  { brand: 'speedmate', keywords: ['스피드메이트', 'speedmate'] },
  { brand: 'autooasis', keywords: ['오토오아시스'] },
  { brand: 'carpos', keywords: ['카포스'] },
  { brand: 'gongim', keywords: ['공임나라'] },
  // ── 타이어 전문 ──
  // 체인(티스테이션·타이어프로 등)과 동네 타이어점을 하나로 묶는다. 상호에 '타이어'가 들어간
  // 곳은 사실상 전부 타이어를 취급하므로 넓게 잡아도 오탐이 아니다("타이어 갈 곳"을 찾는 용도).
  // 단 위 완성차/정유사 규칙이 먼저 걸리므로 '금호타이어 서비스' 류가 여기로 새지 않는다.
  {
    brand: 'tire',
    keywords: [
      '타이어', 'tire', '티스테이션', 'tstation', '넥센', '미쉐린', 'michelin',
      '브리지스톤', 'bridgestone', '던롭', 'dunlop', '피렐리', 'pirelli',
    ],
  },
  // ── 자동차검사(지정정비사업자) ──
  // ⚠️ '지정정비' 는 쓰지 않는다 — 실데이터의 '지정정비' 57건은 대부분
  //    '르노삼성자동차 지정정비코너' 로 검사소가 아니라 르노 서비스망이다(위에서 이미 잡힌다).
  { brand: 'inspection', keywords: ['검사소', '자동차검사', '종합검사', '검사정비'] },
];

/**
 * 업체명에서 브랜드를 판별한다. 못 찾으면 null(= '기타/무소속').
 * null 이 정상이고 다수다 — 34,172곳 중 약 94%가 브랜드 없는 동네 카센터다.
 */
export function detectBrand(name: string | null | undefined): RepairBrand | null {
  if (!name) return null;
  const c = canon(name);
  if (c.length === 0) return null;
  for (const { brand, keywords } of RULES) {
    if (keywords.some((k) => c.includes(k))) return brand;
  }
  return null;
}
