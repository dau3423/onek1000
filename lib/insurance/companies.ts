// 자동차보험사 긴급 연락처.
//
// ⚠️ 출처와 검증(2026-08-26): 손해보험협회 자동차보험 종합포털의 '보험사별 상담창구'
//    (https://carinfo.knia.or.kr/lmxsrv/cnswc/icnyCnswcList.do) 를 1차 출처로 삼고,
//    서울시 정보소통광장의 '주요 손해보험사 연락처' 문서와 교차검증해 12곳 모두 일치를 확인했다.
//    (교차검증이 실제로 오류를 잡았다 — 일반 검색에서는 KB손해보험이 1588-0114 로 나왔지만
//     두 공식 출처 모두 **1544-0114** 였다. 사고 현장에서 걸리지 않는 번호는 최악이라 반드시
//     공식 출처로만 갱신할 것.)
//
// ⚠️ 이 번호는 각 사의 **대표번호**다. 대부분 ARS 로 사고접수·긴급출동이 갈린다.
//    "긴급출동 전용"이라고 단정해 표기하지 않는다 — 사실과 다를 수 있다.
//
// DB 에 두지 않는 이유: 12곳뿐이고 거의 바뀌지 않는다. 테이블·마이그레이션·sync 를 만들 값어치가
// 없고, 코드에 두면 번호 변경이 리뷰와 배포 기록에 남아 추적이 오히려 쉽다.

/** 보험사 식별자 — users.insurance_company 에 저장하는 값. 절대 재사용/변경하지 않는다. */
export type InsurerId =
  | 'samsung' | 'hyundai' | 'db' | 'kb' | 'meritz' | 'hanwha'
  | 'lotte' | 'heungkuk' | 'mg' | 'axa' | 'hana' | 'carrot';

export interface Insurer {
  id: InsurerId;
  /** 표시용 정식 명칭. */
  name: string;
  /** 사고접수·긴급출동 대표번호(하이픈 포함 표기). tel: 링크에서는 하이픈을 제거해 쓴다. */
  tel: string;
}

/**
 * 목록 순서 = 자동차보험 시장에서 흔히 접하는 순.
 * 긴급 상황에서 훑는 목록이라 가나다순보다 '많이 쓰는 것부터'가 찾기 빠르다.
 */
export const INSURERS: readonly Insurer[] = [
  { id: 'samsung',  name: '삼성화재',     tel: '1588-5114' },
  { id: 'hyundai',  name: '현대해상',     tel: '1588-5656' },
  { id: 'db',       name: 'DB손해보험',   tel: '1588-0100' },
  { id: 'kb',       name: 'KB손해보험',   tel: '1544-0114' },
  { id: 'meritz',   name: '메리츠화재',   tel: '1566-7711' },
  { id: 'hanwha',   name: '한화손해보험', tel: '1566-8000' },
  { id: 'lotte',    name: '롯데손해보험', tel: '1588-3344' },
  { id: 'heungkuk', name: '흥국화재',     tel: '1688-1688' },
  { id: 'mg',       name: 'MG손해보험',   tel: '1588-5959' },
  { id: 'axa',      name: 'AXA손해보험',  tel: '1566-1566' },
  { id: 'hana',     name: '하나손해보험', tel: '1566-3000' },
  { id: 'carrot',   name: '캐롯손해보험', tel: '1566-0300' },
] as const;

const BY_ID = new Map(INSURERS.map((i) => [i.id, i]));

export function findInsurer(id: string | null | undefined): Insurer | null {
  return id ? BY_ID.get(id as InsurerId) ?? null : null;
}

/** 외부 입력(저장 요청 등)이 우리가 아는 보험사인지 검증한다. */
export function isInsurerId(v: unknown): v is InsurerId {
  return typeof v === 'string' && BY_ID.has(v as InsurerId);
}

/** tel: 링크용 — 하이픈 제거. */
export function telHref(tel: string): string {
  return `tel:${tel.replace(/-/g, '')}`;
}
