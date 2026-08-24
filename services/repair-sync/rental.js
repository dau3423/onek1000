// 렌터카 sync — 전국렌터카업체정보표준데이터(data.go.kr).
// 웹앱의 lib/rental/{client,normalize}.ts 와 같은 규약을 JS 로 옮긴 것이다
// (이 서비스는 자체 완결형이어야 Cloud Run 에 단독 배포된다).

import { createClient } from '@supabase/supabase-js';
import {
  hashKey, nullify, toDate, toInt, isValidKrCoord, sigunguCodeFromAddress,
  runSync, resolveEnv,
} from './common.js';

const ENDPOINT = 'tn_pubr_public_car_rental_api';
const MAX_PAGES = 40;
/** 실측(2026-08-24 전수): 원천 2,147행 → 차고지 중복 병합 후 2,006곳. 절반 아래면 정리 건너뜀. */
const MIN_EXPECTED_ROWS = 1_000;

/**
 * 원문 → rental_cars 행.
 *
 * ⚠️ 원천 문서의 오타를 그대로 따른다:
 *    weekdayOperColseHhmm (Close 아님, **Colse**) / holidayCloseOpenHhmm
 *    고쳐 쓰면 값이 조용히 undefined 가 된다.
 * ⚠️ 대표자명(rprsntvNm)은 적재하지 않는다 — 개인정보이고 표시 용도가 없다.
 */
function normalize(items, syncedAt) {
  const stats = { total: items.length, dropped: { noName: 0, badCoord: 0 }, withFee: 0, withEv: 0 };
  const byKey = new Map();

  for (const it of items) {
    const name = nullify(it.entrpsNm);
    if (!name) { stats.dropped.noName++; continue; }

    const lat = Number(nullify(it.latitude));
    const lng = Number(nullify(it.longitude));
    if (!isValidKrCoord(lat, lng)) { stats.dropped.badCoord++; continue; }

    const fees = {
      fee_light: toInt(it.lghvhclChrge),
      fee_small: toInt(it.cmhvhclChrge),
      fee_medium: toInt(it.mdhvhclChrge),
      fee_large: toInt(it.lgshvhclChrge),
      fee_van: toInt(it.vahvhclChrge),
      fee_leisure: toInt(it.lshvhclChrge),
      fee_imported: toInt(it.imhvhclChrge),
    };
    if (Object.values(fees).some((v) => v !== null && v > 0)) stats.withFee++;

    const evSedan = toInt(it.eleCarHoldCo);
    const evVan = toInt(it.eleVansCarHoldCo);
    if ((evSedan ?? 0) + (evVan ?? 0) > 0) stats.withEv++;

    const addr = nullify(it.rdnmadr) ?? nullify(it.lnmadr);
    const key = hashKey([name, addr ?? '']);
    const row = {
      place_key: key,
      name,
      biz_kind: nullify(it.bplcType),
      road_addr: nullify(it.rdnmadr),
      jibun_addr: nullify(it.lnmadr),
      tel: nullify(it.phoneNumber),
      homepage: nullify(it.homepageUrl),
      wd_open: nullify(it.weekdayOperOpenHhmm),
      wd_close: nullify(it.weekdayOperColseHhmm),
      we_open: nullify(it.wkendOperOpenHhmm),
      we_close: nullify(it.wkendOperCloseHhmm),
      hd_open: nullify(it.holidayOperOpenHhmm),
      hd_close: nullify(it.holidayCloseOpenHhmm),
      holiday: nullify(it.rstde),
      total_cars: toInt(it.vhcleHoldCo),
      sedan_cars: toInt(it.carHoldCo),
      van_cars: toInt(it.vansHoldCo),
      ev_sedan_cars: evSedan,
      ev_van_cars: evVan,
      ...fees,
      lat,
      lng,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      sigungu_code: sigunguCodeFromAddress(addr),
      data_base_date: toDate(it.referenceDate),
      // ⚠️ synced_at 은 반드시 행에 실어야 한다 — 빠지면 conflict-update 시 옛 값이 남고
      //    뒤이은 stale 정리가 전부 지운다(정비소에서 실제로 겪은 사고).
      synced_at: syncedAt,
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
      const maxOf = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));
      prev.total_cars = maxOf(prev.total_cars, row.total_cars);
      prev.sedan_cars = maxOf(prev.sedan_cars, row.sedan_cars);
      prev.van_cars = maxOf(prev.van_cars, row.van_cars);
      prev.ev_sedan_cars = maxOf(prev.ev_sedan_cars, row.ev_sedan_cars);
      prev.ev_van_cars = maxOf(prev.ev_van_cars, row.ev_van_cars);
      for (const k of ['tel', 'homepage', 'holiday', 'biz_kind',
                       'wd_open', 'wd_close', 'we_open', 'we_close', 'hd_open', 'hd_close',
                       'fee_light', 'fee_small', 'fee_medium', 'fee_large',
                       'fee_van', 'fee_leisure', 'fee_imported']) {
        if (prev[k] == null && row[k] != null) prev[k] = row[k];
      }
    } else {
      byKey.set(key, row);
    }
  }
  return { rows: [...byKey.values()], stats };
}

export async function runRentalSync({ dryRun = false, maxPages = MAX_PAGES } = {}) {
  const env = resolveEnv();
  if (env.error) return { ok: false, error: env.error };
  const sb = createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } });
  return runSync(sb, {
    endpoint: ENDPOINT,
    table: 'rental_cars',
    conflictKey: 'place_key',
    normalize,
    key: env.key,
    maxPages: Math.min(Math.max(1, maxPages), MAX_PAGES),
    minExpectedRows: MIN_EXPECTED_ROWS,
    dryRun,
  });
}
