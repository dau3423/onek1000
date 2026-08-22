// 주소 문자열 → 시군구 코드(opinet AREA_CD 4자리) 매칭.
//
// 왜 필요한가: 주유소(stations)에는 sigungu_code 가 있어 지역 랜딩(/regions/…)을 만들 수 있었지만,
// 정비소·세차장·EV 충전소는 공공데이터 원천에 시군구 코드가 없고 **주소 텍스트만** 있다.
// 지역 페이지를 만들려면 그 텍스트에서 시군구를 뽑아내야 한다.
//
// 매칭 순서가 중요하다 — 시도를 먼저 확정하고 그 안에서만 시군구를 찾는다.
// '중구'는 서울·부산·대구·인천·대전·울산에 모두 있어서, 시도를 안 보고 이름만 맞추면 틀린다.
//
// ⚠️ 한계(알고 있는 것): SIGUNGU 는 opinet 기준이라 시 산하 일반구가 시로 묶여 있다
//    (수원시 장안구 → '수원시'). 그래서 '수원시 장안구 …' 주소는 수원시 페이지로 간다.
//    검색량은 '수원 정비소' 쪽이 훨씬 크므로 이 단위로 충분하다고 보고 그대로 둔다.

import { SIGUNGU, type Sigungu } from '@/lib/sigungu-data';
import { SIDO_NAME, type SidoCode } from '@/types/station';

/**
 * 주소 첫머리에 나오는 시도 표기 → 시도 코드.
 * 공공데이터마다 '서울' / '서울특별시' / '서울시' 가 섞여 있어 전부 받는다.
 * 긴 표기를 먼저 두어야 '경기'가 '경기도'보다 먼저 잘리는 일이 없다(아래에서 길이순 정렬).
 */
const SIDO_ALIASES: Record<SidoCode, string[]> = {
  '01': ['서울특별시', '서울시', '서울'],
  '02': ['경기도', '경기'],
  '03': ['강원특별자치도', '강원도', '강원'],
  '04': ['충청북도', '충북'],
  '05': ['충청남도', '충남'],
  '06': ['전북특별자치도', '전라북도', '전북'],
  '07': ['전라남도', '전남'],
  '08': ['경상북도', '경북'],
  '09': ['경상남도', '경남'],
  '10': ['부산광역시', '부산시', '부산'],
  '11': ['제주특별자치도', '제주도', '제주'],
  '14': ['대구광역시', '대구시', '대구'],
  '15': ['인천광역시', '인천시', '인천'],
  '16': ['광주광역시', '광주시', '광주'],
  '17': ['대전광역시', '대전시', '대전'],
  '18': ['울산광역시', '울산시', '울산'],
  '19': ['세종특별자치시', '세종시', '세종'],
};

/** 별칭을 길이 내림차순으로 펼쳐 둔다 — '서울특별시'가 '서울'보다 먼저 매칭되게. */
const SIDO_LOOKUP: { alias: string; code: SidoCode }[] = (
  Object.entries(SIDO_ALIASES) as [SidoCode, string[]][]
)
  .flatMap(([code, aliases]) => aliases.map((alias) => ({ alias, code })))
  .sort((a, b) => b.alias.length - a.alias.length);

/** 시도별 시군구 목록 — 이름 길이 내림차순('수원시'가 '수원'보다, '고성군'이 '고성'보다 먼저). */
const BY_SIDO = new Map<SidoCode, Sigungu[]>();
for (const sg of SIGUNGU) {
  const list = BY_SIDO.get(sg.sido) ?? [];
  list.push(sg);
  BY_SIDO.set(sg.sido, list);
}
for (const list of BY_SIDO.values()) list.sort((a, b) => b.name.length - a.name.length);

/** 주소에서 시도 코드를 찾는다. 못 찾으면 null. */
export function sidoFromAddress(addr: string | null | undefined): SidoCode | null {
  const s = (addr ?? '').trim();
  if (!s) return null;
  // 시도 표기는 주소 맨 앞에 온다. 앞 12자만 봐서 본문 중간의 지명에 낚이지 않게 한다
  // (예: '경기도 안산시 … 서울대로' 의 '서울').
  const head = s.slice(0, 12);
  for (const { alias, code } of SIDO_LOOKUP) {
    if (head.startsWith(alias)) return code;
  }
  return null;
}

/**
 * 주소 → 시군구 코드(4자리). 못 찾으면 null.
 * 세종은 시군구가 없어 SIGUNGU 에 항목이 없다 → 항상 null(시도 페이지가 커버).
 */
export function sigunguCodeFromAddress(addr: string | null | undefined): string | null {
  const s = (addr ?? '').trim();
  if (!s) return null;
  const sido = sidoFromAddress(s);
  if (!sido) return null;
  const candidates = BY_SIDO.get(sido);
  if (!candidates) return null;
  // 시도 표기 뒤쪽에서만 찾는다 — 시도명이 시군구명과 겹치는 경우를 피한다.
  const rest = s.slice(0, 40);
  for (const sg of candidates) {
    if (rest.includes(sg.name)) return sg.code;
  }
  return null;
}

/** 진단용 — 시도명(한글)까지 함께 돌려준다. */
export function describeMatch(addr: string): { sido: SidoCode | null; sidoName: string | null; code: string | null } {
  const sido = sidoFromAddress(addr);
  return {
    sido,
    sidoName: sido ? SIDO_NAME[sido] : null,
    code: sigunguCodeFromAddress(addr),
  };
}
