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
/** 전국 렌터카 등록업체는 1,300개소 규모(2024 통계) — 그보다 한참 낮게 잡아 원천 이상만 거른다. */
const MIN_EXPECTED_ROWS = 300;

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
    byKey.set(key, {
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
    });
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
