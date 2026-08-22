// 표준데이터 원문 → 우리 스키마(repair_shops) 정규화.
// 순수 함수만 둔다 — 네트워크·DB 를 모르므로 단독으로 검증할 수 있다.

import { createHash } from 'node:crypto';
import type { RepairBrand, RepairShopType } from '@/types/repair';
import { detectBrand } from './brand';
import type { RepairApiItem } from './client';

/** 한반도 bbox 가드(좌표 이상치 드랍) — sync-carwash 와 동일 기준. */
export const KR_LAT_MIN = 33;
export const KR_LAT_MAX = 39;
export const KR_LNG_MIN = 124;
export const KR_LNG_MAX = 132;

/**
 * 코드값 정규화 — 지자체마다 '1' 과 '01' 을 혼용한다(실측 확인).
 * 앞 0을 떼지 않으면 폐업 필터가 조용히 새어나가므로 반드시 거친다.
 * '0' 자체는 살려둔다(전부 떼면 빈 문자열이 된다).
 */
export function normalizeCode(v: string | undefined | null): string {
  const s = (v ?? '').trim();
  if (s.length === 0) return '';
  const stripped = s.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : '0';
}

/** data.go.kr 은 빈 값을 ''·'null'·공백으로 준다 — 전부 null 로 접는다. */
export function nullify(v: string | undefined | null): string | null {
  const s = (v ?? '').trim();
  if (s.length === 0 || s.toLowerCase() === 'null') return null;
  return s;
}

/** 업체종류 코드 → 우리 유형. 코드 정의는 공식 문서로 확인 불가라, 실데이터 분포로 확정했다. */
export function toShopType(raw: string | undefined | null): RepairShopType {
  switch (normalizeCode(raw)) {
    case '1': return 'general';    // 자동차종합정비업(1급)
    case '2': return 'small';      // 소형자동차정비업(2급)
    case '3': return 'specialty';  // 자동차전문정비업(카센터) — 실데이터의 약 79%
    case '4': return 'engine';     // 원동기전문정비업
    default: return 'unknown';
  }
}

/**
 * 영업 중인지 판정. 영업(1) 만 적재하고 휴업(2)·폐업(3)은 버린다.
 *
 * 코드가 비어 있으면 어떻게 할 것인가: **적재한다**. 원천에 상태가 없는 행을 폐업으로
 * 간주하면 멀쩡한 정비소가 지도에서 사라진다. 대신 폐업일자가 채워져 있으면 코드와
 * 무관하게 폐업으로 본다(실측상 폐업 행은 폐업일자가 100% 채워져 있다).
 */
export function isOperating(item: RepairApiItem): boolean {
  if (nullify(item.clsbizDate) !== null) return false;
  const code = normalizeCode(item.bsnSttus);
  if (code === '') return true;
  return code === '1';
}

/** 'YYYYMMDD' 또는 'YYYY-MM-DD' → 'YYYY-MM-DD'. 그 외는 null. */
export function toDate(v: string | undefined | null): string | null {
  const s = nullify(v);
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const y = digits.slice(0, 4), m = digits.slice(4, 6), d = digits.slice(6, 8);
  if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${m}-${d}`;
}

/**
 * 결정적 합성키. 이 표준데이터에는 고유 관리번호가 없어서 직접 만든다.
 * 같은 입력이면 항상 같은 키 → 재실행이 멱등이다.
 * 주소는 도로명 우선, 없으면 지번을 쓴다(도로명 채움률 98.8%, 지번 75.4%).
 */
export function makeShopKey(item: RepairApiItem): string {
  const parts = [
    nullify(item.insttCode) ?? nullify(item.instt_code) ?? '',
    nullify(item.inspofcNm) ?? '',
    nullify(item.rdnmadr) ?? nullify(item.lnmadr) ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

export interface RepairDbRow {
  shop_key: string;
  name: string;
  shop_type: RepairShopType;
  /** 업체명에서 추론한 체인·공식망. null = 무소속(다수). */
  brand: RepairBrand | null;
  road_addr: string | null;
  jibun_addr: string | null;
  tel: string | null;
  open_time: string | null;
  close_time: string | null;
  biz_status: string | null;
  area: string | null;
  lat: number;
  lng: number;
  geom: string;
  institution: string | null;
  data_base_date: string | null;
}

export interface NormalizeStats {
  total: number;
  dropped: { notOperating: number; noName: number; badCoord: number };
}

/**
 * 원문 배열 → DB 행 배열. 버려진 행은 사유별로 센다(조용한 유실 방지).
 * 같은 shop_key 가 여러 번 나오면 마지막 값이 이긴다(upsert 안전).
 */
export function normalizeItems(items: RepairApiItem[]): { rows: RepairDbRow[]; stats: NormalizeStats } {
  const stats: NormalizeStats = { total: items.length, dropped: { notOperating: 0, noName: 0, badCoord: 0 } };
  const byKey = new Map<string, RepairDbRow>();

  for (const item of items) {
    if (!isOperating(item)) { stats.dropped.notOperating++; continue; }

    const name = nullify(item.inspofcNm);
    if (!name) { stats.dropped.noName++; continue; }

    const lat = Number(nullify(item.latitude));
    const lng = Number(nullify(item.longitude));
    if (
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < KR_LAT_MIN || lat > KR_LAT_MAX ||
      lng < KR_LNG_MIN || lng > KR_LNG_MAX
    ) { stats.dropped.badCoord++; continue; }

    const key = makeShopKey(item);
    byKey.set(key, {
      shop_key: key,
      name,
      shop_type: toShopType(item.inspofcType),
      brand: detectBrand(name),
      road_addr: nullify(item.rdnmadr),
      jibun_addr: nullify(item.lnmadr),
      tel: nullify(item.phoneNumber),
      open_time: nullify(item.operOpenHm),
      close_time: nullify(item.operCloseHm),
      biz_status: nullify(item.bsnSttus),
      area: nullify(item.ar),
      lat,
      lng,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      institution: nullify(item.institutionNm),
      data_base_date: toDate(item.referenceDate),
    });
  }

  return { rows: [...byKey.values()], stats };
}
