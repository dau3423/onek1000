// SEO 지역 랜딩용 지역(시도) 메타. URL 슬러그는 ASCII(안정성)로 두고,
// 한국어 검색어("서울 최저가 주유소")는 페이지 제목·H1·본문에서 잡는다.
import { SIDO_NAME, type SidoCode } from '@/types/station';
import { SIGUNGU, type Sigungu } from '@/lib/sigungu-data';

export const SIDO_SLUG: Record<SidoCode, string> = {
  '01': 'seoul', '02': 'gyeonggi', '03': 'gangwon', '04': 'chungbuk', '05': 'chungnam',
  '06': 'jeonbuk', '07': 'jeonnam', '08': 'gyeongbuk', '09': 'gyeongnam', '10': 'busan',
  '11': 'jeju', '14': 'daegu', '15': 'incheon', '16': 'gwangju', '17': 'daejeon',
  '18': 'ulsan', '19': 'sejong',
};

export interface Region {
  code: SidoCode;
  slug: string;
  name: string; // 한국어 시도명(서울, 경기 …)
}

/** 전체 지역 목록(인덱스/사이트맵/정적 생성용). 시도 코드 오름차순.
 *
 * ⚠️ 코드순 정렬은 표시 순서를 위해 필수다. Object.keys 순서를 그대로 쓰면 V8이 '10'~'19'(정수형 키)를
 *    먼저 내놓고 '01'~'09'(선행 0라 정수형이 아님)를 뒤로 밀어, 화면에 "부산 제주 대구 … 서울 경기"로
 *    나온다. 정렬해야 "서울 경기 강원 …" 순이 된다. */
export const REGIONS: Region[] = (Object.keys(SIDO_SLUG) as SidoCode[])
  .sort((a, b) => a.localeCompare(b))
  .map((code) => ({
    code,
    slug: SIDO_SLUG[code],
    name: SIDO_NAME[code],
  }));

const SLUG_TO_CODE = Object.fromEntries(REGIONS.map((r) => [r.slug, r.code])) as Record<string, SidoCode>;

/** URL 슬러그 → 지역. 알 수 없는 슬러그면 null(페이지에서 notFound 처리). */
export function regionBySlug(slug: string): Region | null {
  const code = SLUG_TO_CODE[slug];
  return code ? { code, slug, name: SIDO_NAME[code] } : null;
}

// ─── 시군구(기초자치단체) ───
// 시군구 페이지 URL: /regions/{시도슬러그}/{시군구코드}. 코드는 ASCII·고유·안정적이라 슬러그로 쓴다.

const SIGUNGU_BY_CODE = new Map(SIGUNGU.map((s) => [s.code, s]));

/** 특정 시도(sido code)에 속한 시군구 목록(이름 가나다순). */
export function sigungusBySido(sido: SidoCode): Sigungu[] {
  return SIGUNGU.filter((s) => s.sido === sido).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 시군구 코드 → 메타. 없으면 null. */
export function sigunguByCode(code: string): Sigungu | null {
  return SIGUNGU_BY_CODE.get(code) ?? null;
}
