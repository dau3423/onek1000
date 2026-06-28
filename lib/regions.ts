// SEO 지역 랜딩용 지역(시도) 메타. URL 슬러그는 ASCII(안정성)로 두고,
// 한국어 검색어("서울 최저가 주유소")는 페이지 제목·H1·본문에서 잡는다.
import { SIDO_NAME, type SidoCode } from '@/types/station';

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

/** 전체 지역 목록(인덱스/사이트맵/정적 생성용). */
export const REGIONS: Region[] = (Object.keys(SIDO_SLUG) as SidoCode[]).map((code) => ({
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
