// 자동차검사소 표준데이터 원문 → 우리 스키마(inspection_stations) 정규화.
// 순수 함수만 둔다.

import { createHash } from 'node:crypto';
import { nullify, toDate, toInt, toBool, isValidKrCoord } from '@/lib/dataGoKr/standardApi';
import { sigunguCodeFromAddress } from '@/lib/regions/addressMatch';
import type { InspectionApiItem } from './client';

/** 결정적 합성키(검사소명|주소). 재실행 멱등. */
export function makeInspectionKey(item: InspectionApiItem): string {
  const parts = [
    nullify(item.inspofcNm) ?? '',
    nullify(item.rdnmadr) ?? nullify(item.lnmadr) ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

/**
 * 운영시간은 **파싱하지 않고 원문을 보존한다**.
 *
 * 실측(821건 전수): 40%(330건)가 '평일 09:00~18:00+토요일 09:00~13:00' 처럼 구간이 둘 이상이다.
 * 시작/종료 두 칸으로 쪼개면 첫 구간만 남고 토요일 정보가 사라진다 — 채움률 100% 인 필드라 손실이 크다.
 * '평일(09:00~18:00)' 같은 변형도 있어 안전한 규칙을 만들 수 없다.
 *
 * 다만 '+' 구분자는 화면에서 읽기 나빠 가운뎃점으로만 바꾼다(내용은 그대로).
 */
export function normalizeOperTime(raw: string | undefined | null): string | null {
  const s = nullify(raw);
  if (!s) return null;
  return s.replace(/\s*\+\s*/g, ' · ');
}

export interface InspectionDbRow {
  place_key: string;
  name: string;
  office_type: string | null;
  road_addr: string | null;
  jibun_addr: string | null;
  tel: string | null;
  /** 운영시간 원문(파싱하지 않음 — 위 normalizeOperTime 주석 참고). */
  oper_time: string | null;
  lane_count: number | null;
  staff_count: number | null;
  can_new: boolean | null;
  can_regular: boolean | null;
  can_tuning: boolean | null;
  can_temporary: boolean | null;
  can_repair: boolean | null;
  can_emission: boolean | null;
  can_taximeter: boolean | null;
  lat: number;
  lng: number;
  geom: string;
  sigungu_code: string | null;
  data_base_date: string | null;
  /** 빠뜨리면 stale 정리가 전체를 지운다 — 정비소에서 실제로 겪은 사고. */
  synced_at: string;
}

export interface InspectionNormalizeStats {
  total: number;
  dropped: { noName: number; badCoord: number };
  /** 참고 지표 — 검사 종류가 하나라도 표기된 행 수(원천 채움률 확인용). */
  withCapability: number;
}

export function normalizeInspectionItems(
  items: InspectionApiItem[],
  syncedAt: string,
): { rows: InspectionDbRow[]; stats: InspectionNormalizeStats } {
  const stats: InspectionNormalizeStats = {
    total: items.length,
    dropped: { noName: 0, badCoord: 0 },
    withCapability: 0,
  };
  const byKey = new Map<string, InspectionDbRow>();

  for (const item of items) {
    const name = nullify(item.inspofcNm);
    if (!name) { stats.dropped.noName++; continue; }

    const lat = Number(nullify(item.latitude));
    const lng = Number(nullify(item.longitude));
    if (!isValidKrCoord(lat, lng)) { stats.dropped.badCoord++; continue; }

    const caps = {
      can_new: toBool(item.newInspofcYn),
      can_regular: toBool(item.fdrmInspofcYn),
      can_tuning: toBool(item.tuningInspofcYn),
      can_temporary: toBool(item.tempInspofcYn),
      can_repair: toBool(item.repairInspofcYn),
      can_emission: toBool(item.exhstGasInspofcYn),
      can_taximeter: toBool(item.taxiMeterYn),
    };
    if (Object.values(caps).some((v) => v !== null)) stats.withCapability++;

    const key = makeInspectionKey(item);
    byKey.set(key, {
      place_key: key,
      name,
      office_type: nullify(item.inspofcType),
      road_addr: nullify(item.rdnmadr),
      jibun_addr: nullify(item.lnmadr),
      // ⚠️ inspofcPhoneNumber 가 검사소 번호다. phoneNumber 는 관리기관(관청) 번호라 쓰면 안 된다.
      tel: nullify(item.inspofcPhoneNumber),
      oper_time: normalizeOperTime(item.operTime),
      lane_count: toInt(item.inspofcCo),
      staff_count: toInt(item.inspofcHnfCo),
      ...caps,
      lat,
      lng,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      sigungu_code: sigunguCodeFromAddress(nullify(item.rdnmadr) ?? nullify(item.lnmadr)),
      data_base_date: toDate(item.referenceDate),
      synced_at: syncedAt,
    });
  }

  return { rows: [...byKey.values()], stats };
}
