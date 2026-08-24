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
 * 운영시간 문자열 → 시작/종료 분리.
 * 원천이 '09:00~18:00', '09:00-18:00', '0900~1800' 등 자유 형식이라 파싱이 실패할 수 있다.
 * 실패하면 **둘 다 null 로 두고 원문을 버리지 않는다**(open_time 에 원문을 넣는다) —
 * 어설프게 쪼갠 값을 화면에 '09:00 영업 시작'처럼 단정해 보여주는 것보다, 원문 그대로가 정직하다.
 */
export function splitOperTime(raw: string | undefined | null): { open: string | null; close: string | null } {
  const s = nullify(raw);
  if (!s) return { open: null, close: null };
  const m = s.match(/(\d{1,2}):?(\d{2})\s*[~\-–]\s*(\d{1,2}):?(\d{2})/);
  if (!m) return { open: s, close: null };   // 파싱 실패 → 원문을 open 에 보존
  const pad = (h: string, mm: string) => `${h.padStart(2, '0')}:${mm}`;
  return { open: pad(m[1], m[2]), close: pad(m[3], m[4]) };
}

export interface InspectionDbRow {
  place_key: string;
  name: string;
  office_type: string | null;
  road_addr: string | null;
  jibun_addr: string | null;
  tel: string | null;
  open_time: string | null;
  close_time: string | null;
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

    const { open, close } = splitOperTime(item.operTime);
    const key = makeInspectionKey(item);
    byKey.set(key, {
      place_key: key,
      name,
      office_type: nullify(item.inspofcType),
      road_addr: nullify(item.rdnmadr),
      jibun_addr: nullify(item.lnmadr),
      // ⚠️ inspofcPhoneNumber 가 검사소 번호다. phoneNumber 는 관리기관(관청) 번호라 쓰면 안 된다.
      tel: nullify(item.inspofcPhoneNumber),
      open_time: open,
      close_time: close,
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
