// 렌터카 표준데이터 원문 → 우리 스키마(rental_cars) 정규화.
// 순수 함수만 둔다 — 네트워크·DB 를 모르므로 단독으로 검증할 수 있다.

import { createHash } from 'node:crypto';
import { nullify, toDate, toInt, isValidKrCoord } from '@/lib/dataGoKr/standardApi';
import { sigunguCodeFromAddress } from '@/lib/regions/addressMatch';
import type { RentalApiItem } from './client';

/**
 * 결정적 합성키. 이 표준데이터에도 고유 관리번호가 없어 직접 만든다.
 * 같은 입력이면 항상 같은 키 → 재실행이 멱등이다.
 *
 * 정비소(makeShopKey)는 기관코드를 키에 넣었지만 여기서는 넣지 않는다:
 * 렌터카는 지자체 경계를 넘나드는 영업소가 있어 같은 사업장이 다른 기관으로 올라오면
 * 키가 갈라져 중복 마커가 된다. 업체명+주소만으로도 충돌 위험은 무시할 수준이다.
 */
export function makeRentalKey(item: RentalApiItem): string {
  const parts = [
    nullify(item.entrpsNm) ?? '',
    nullify(item.rdnmadr) ?? nullify(item.lnmadr) ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

export interface RentalDbRow {
  place_key: string;
  name: string;
  biz_kind: string | null;
  road_addr: string | null;
  jibun_addr: string | null;
  tel: string | null;
  homepage: string | null;
  wd_open: string | null; wd_close: string | null;
  we_open: string | null; we_close: string | null;
  hd_open: string | null; hd_close: string | null;
  holiday: string | null;
  total_cars: number | null;
  sedan_cars: number | null;
  van_cars: number | null;
  ev_sedan_cars: number | null;
  ev_van_cars: number | null;
  fee_light: number | null;
  fee_small: number | null;
  fee_medium: number | null;
  fee_large: number | null;
  fee_van: number | null;
  fee_leisure: number | null;
  fee_imported: number | null;
  lat: number;
  lng: number;
  geom: string;
  sigungu_code: string | null;
  data_base_date: string | null;
  /** 이번 sync 실행 시각. **반드시 upsert 에 실어야 한다** — 빠지면 conflict-update 시 예전 값이
   *  남고, 뒤이은 stale 정리가 "오래된 행"으로 보고 전부 지운다(정비소에서 실제로 겪은 사고). */
  synced_at: string;
}

export interface RentalNormalizeStats {
  total: number;
  dropped: { noName: number; badCoord: number };
  /** 참고 지표 — 요금이 하나라도 있는 행 / 전기차 보유 행. 원천 채움률을 sync 로그로 확인한다. */
  withFee: number;
  withEv: number;
}

/**
 * 원문 배열 → DB 행 배열. 버려진 행은 사유별로 센다(조용한 유실 방지).
 * 같은 place_key 가 여러 번 나오면 마지막 값이 이긴다(upsert 안전).
 *
 * 폐업 필터가 없는 이유: 이 표준데이터에는 영업상태·폐업일자 필드 자체가 없다.
 * 지자체가 등록 목록에서 빼면 원천에서 사라지고, 우리 쪽은 stale 정리로 따라 지워진다.
 */
export function normalizeRentalItems(
  items: RentalApiItem[],
  syncedAt: string,
): { rows: RentalDbRow[]; stats: RentalNormalizeStats } {
  const stats: RentalNormalizeStats = {
    total: items.length,
    dropped: { noName: 0, badCoord: 0 },
    withFee: 0,
    withEv: 0,
  };
  const byKey = new Map<string, RentalDbRow>();

  for (const item of items) {
    const name = nullify(item.entrpsNm);
    if (!name) { stats.dropped.noName++; continue; }

    const lat = Number(nullify(item.latitude));
    const lng = Number(nullify(item.longitude));
    if (!isValidKrCoord(lat, lng)) { stats.dropped.badCoord++; continue; }

    const fees = {
      fee_light: toInt(item.lghvhclChrge),
      fee_small: toInt(item.cmhvhclChrge),
      fee_medium: toInt(item.mdhvhclChrge),
      fee_large: toInt(item.lgshvhclChrge),
      fee_van: toInt(item.vahvhclChrge),
      fee_leisure: toInt(item.lshvhclChrge),
      fee_imported: toInt(item.imhvhclChrge),
    };
    if (Object.values(fees).some((v) => v !== null && v > 0)) stats.withFee++;

    const evSedan = toInt(item.eleCarHoldCo);
    const evVan = toInt(item.eleVansCarHoldCo);
    if ((evSedan ?? 0) + (evVan ?? 0) > 0) stats.withEv++;

    const key = makeRentalKey(item);
    const row = {
      place_key: key,
      name,
      biz_kind: nullify(item.bplcType),
      road_addr: nullify(item.rdnmadr),
      jibun_addr: nullify(item.lnmadr),
      tel: nullify(item.phoneNumber),
      homepage: nullify(item.homepageUrl),
      // ⚠️ 평일 종료는 원천 필드명이 weekdayOperColseHhmm(오타) 이다. 고치면 값이 사라진다.
      wd_open: nullify(item.weekdayOperOpenHhmm),
      wd_close: nullify(item.weekdayOperColseHhmm),
      we_open: nullify(item.wkendOperOpenHhmm),
      we_close: nullify(item.wkendOperCloseHhmm),
      hd_open: nullify(item.holidayOperOpenHhmm),
      hd_close: nullify(item.holidayCloseOpenHhmm),
      holiday: nullify(item.rstde),
      total_cars: toInt(item.vhcleHoldCo),
      sedan_cars: toInt(item.carHoldCo),
      van_cars: toInt(item.vansHoldCo),
      ev_sedan_cars: evSedan,
      ev_van_cars: evVan,
      ...fees,
      lat,
      lng,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      // 도로명 우선, 없으면 지번(정비소와 동일 규약).
      sigungu_code: sigunguCodeFromAddress(nullify(item.rdnmadr) ?? nullify(item.lnmadr)),
      data_base_date: toDate(item.referenceDate),
      synced_at: syncedAt,
      // 대표자명(rprsntvNm)은 의도적으로 적재하지 않는다 — 개인정보이고 표시 용도가 없다.
    };

    // ── 같은 사업장의 여러 차고지 행 병합 ──
    // 원천은 (사업장 × 차고지) 단위로 행을 준다. 실측 2,147행 중 141행이 이 중복이고,
    // 좌표는 같고 차고지 주소만 다르다(예: 제트카㈜ 10행). 지도에는 사업장 1곳이 되어야 하므로
    // 키(이름+주소)로 합친다.
    //
    // 보유 대수는 **합산하지 않고 최댓값**을 쓴다. 필드명은 '자동차총보유대수'인데 행마다 값이
    // 달라(174/242/172…) 총계인지 차고지별 배치인지 원천 문서로 확정할 수 없다. 합산은 과대
    // 표시 위험이 있어, 총계라는 필드명을 믿고 가장 큰 값을 택한다.
    // 요금·연락처처럼 비어 있기 쉬운 값은 먼저 채워진 값을 지키고 빈 자리만 메운다.
    const prev = byKey.get(key);
    if (prev) {
      const maxOf = (a: number | null, b: number | null): number | null => (a == null ? b : b == null ? a : Math.max(a, b));
      prev.total_cars = maxOf(prev.total_cars, row.total_cars);
      prev.sedan_cars = maxOf(prev.sedan_cars, row.sedan_cars);
      prev.van_cars = maxOf(prev.van_cars, row.van_cars);
      prev.ev_sedan_cars = maxOf(prev.ev_sedan_cars, row.ev_sedan_cars);
      prev.ev_van_cars = maxOf(prev.ev_van_cars, row.ev_van_cars);
      for (const k of ['tel', 'homepage', 'holiday', 'biz_kind',
                       'wd_open', 'wd_close', 'we_open', 'we_close', 'hd_open', 'hd_close',
                       'fee_light', 'fee_small', 'fee_medium', 'fee_large',
                       'fee_van', 'fee_leisure', 'fee_imported']) {
        const P = prev as unknown as Record<string, unknown>;
        const R = row as unknown as Record<string, unknown>;
        if (P[k] == null && R[k] != null) P[k] = R[k];
      }
    } else {
      byKey.set(key, row);
    }
  }

  return { rows: [...byKey.values()], stats };
}
