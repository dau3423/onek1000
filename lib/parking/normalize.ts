// 주차장 표준데이터 원문 → 우리 스키마(parking_lots) 정규화.
// 순수 함수만 둔다 — 네트워크·DB 를 모르므로 단독으로 검증할 수 있다.

import { createHash } from 'node:crypto';
import { nullify, toDate, toInt, isValidKrCoord } from '@/lib/dataGoKr/standardApi';
import { sigunguCodeFromAddress } from '@/lib/regions/addressMatch';
import type { ParkingApiItem } from './client';

/**
 * 결정적 합성키. 원천에 prkplceNo 가 있지만 **지자체별 채번이라 전국 유일성이 없다**
 * (예: '236-2-000066' 형식이 기관마다 독립적으로 매겨진다). 그대로 PK 로 쓰면 다른 지역의
 * 주차장끼리 덮어써 조용히 사라진다. 관리번호 + 이름 + 주소를 합쳐 키를 만든다.
 * 같은 입력이면 항상 같은 키 → 재실행이 멱등이다.
 */
export function makeParkingKey(item: ParkingApiItem): string {
  const parts = [
    nullify(item.prkplceNo) ?? '',
    nullify(item.prkplceNm) ?? '',
    nullify(item.rdnmadr) ?? nullify(item.lnmadr) ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

/** 'Y'/'N' → boolean. 그 외(빈값·공백)는 null — 모른다는 뜻을 false 로 뭉개지 않는다. */
function toYn(raw?: string): boolean | null {
  const v = nullify(raw)?.toUpperCase();
  if (v === 'Y') return true;
  if (v === 'N') return false;
  return null;
}

export interface ParkingDbRow {
  place_key: string;
  src_no: string | null;
  name: string;
  lot_kind: string | null;
  lot_type: string | null;
  road_addr: string | null;
  jibun_addr: string | null;
  capacity: number | null;
  fee_kind: string | null;
  basic_time: number | null;
  basic_charge: number | null;
  add_unit_time: number | null;
  add_unit_charge: number | null;
  day_ticket: number | null;
  month_ticket: number | null;
  pay_methods: string | null;
  oper_days: string | null;
  wd_open: string | null; wd_close: string | null;
  sat_open: string | null; sat_close: string | null;
  hd_open: string | null; hd_close: string | null;
  tel: string | null;
  disabled_zone: boolean | null;
  note: string | null;
  inst_name: string | null;
  lat: number;
  lng: number;
  geom: string;
  sigungu_code: string | null;
  data_base_date: string | null;
  /** 이번 sync 실행 시각. **반드시 upsert 에 실어야 한다** — 빠지면 conflict-update 시 예전 값이
   *  남고, 뒤이은 stale 정리가 "오래된 행"으로 보고 전부 지운다(정비소에서 실제로 겪은 사고). */
  synced_at: string;
}

export interface ParkingNormalizeStats {
  total: number;
  dropped: { noName: number; badCoord: number };
  /** 참고 지표 — 원천 채움률을 sync 로그로 확인한다. */
  withCapacity: number;
  free: number;
  paid: number;
}

/**
 * 원문 배열 → DB 행 배열. 버려진 행은 사유별로 센다(조용한 유실 방지).
 * 같은 place_key 가 여러 번 나오면 마지막 값이 이긴다(upsert 안전).
 *
 * 폐업 필터가 없는 이유: 이 표준데이터에는 영업상태 필드가 없다. 지자체가 목록에서 빼면
 * 원천에서 사라지고, 우리 쪽은 stale 정리로 따라 지워진다(렌터카와 동일).
 */
export function normalizeParkingItems(
  items: ParkingApiItem[],
  syncedAt: string,
): { rows: ParkingDbRow[]; stats: ParkingNormalizeStats } {
  const stats: ParkingNormalizeStats = {
    total: items.length,
    dropped: { noName: 0, badCoord: 0 },
    withCapacity: 0,
    free: 0,
    paid: 0,
  };
  const byKey = new Map<string, ParkingDbRow>();

  for (const item of items) {
    const name = nullify(item.prkplceNm);
    if (!name) { stats.dropped.noName++; continue; }

    const lat = Number(nullify(item.latitude));
    const lng = Number(nullify(item.longitude));
    if (!isValidKrCoord(lat, lng)) { stats.dropped.badCoord++; continue; }

    const capacity = toInt(item.prkcmprt);
    if ((capacity ?? 0) > 0) stats.withCapacity++;

    const feeKind = nullify(item.parkingchrgeInfo);
    if (feeKind === '무료') stats.free++;
    else if (feeKind) stats.paid++;

    const key = makeParkingKey(item);
    byKey.set(key, {
      place_key: key,
      src_no: nullify(item.prkplceNo),
      name,
      lot_kind: nullify(item.prkplceSe),
      lot_type: nullify(item.prkplceType),
      road_addr: nullify(item.rdnmadr),
      jibun_addr: nullify(item.lnmadr),
      capacity,
      fee_kind: feeKind,
      basic_time: toInt(item.basicTime),
      basic_charge: toInt(item.basicCharge),
      add_unit_time: toInt(item.addUnitTime),
      add_unit_charge: toInt(item.addUnitCharge),
      day_ticket: toInt(item.dayCmmtkt),
      month_ticket: toInt(item.monthCmmtkt),
      pay_methods: nullify(item.metpay),
      oper_days: nullify(item.operDay),
      // ⚠️ 원천 필드명의 오타를 그대로 쓴다(Colse / OperOper). 고치면 값이 사라진다.
      wd_open: nullify(item.weekdayOperOpenHhmm),
      wd_close: nullify(item.weekdayOperColseHhmm),
      sat_open: nullify(item.satOperOperOpenHhmm),
      sat_close: nullify(item.satOperCloseHhmm),
      hd_open: nullify(item.holidayOperOpenHhmm),
      hd_close: nullify(item.holidayCloseOpenHhmm),
      tel: nullify(item.phoneNumber),
      disabled_zone: toYn(item.pwdbsPpkZoneYn),
      note: nullify(item.spcmnt),
      inst_name: nullify(item.institutionNm),
      lat,
      lng,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      // 도로명 우선, 없으면 지번(렌터카·정비소와 동일 규약). 주차장은 rdnmadr 이 비는 경우가 흔하다.
      sigungu_code: sigunguCodeFromAddress(nullify(item.rdnmadr) ?? nullify(item.lnmadr)),
      data_base_date: toDate(item.referenceDate),
      synced_at: syncedAt,
    });
  }

  return { rows: [...byKey.values()], stats };
}
