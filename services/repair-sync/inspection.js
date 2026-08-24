// 자동차검사소 sync — 전국자동차검사소표준데이터(data.go.kr).
// 웹앱의 lib/inspection/{client,normalize}.ts 와 같은 규약을 JS 로 옮긴 것이다.
//
// 이 데이터가 채우는 자리: 지도의 정비소 레이어에서 '자동차검사소' 필터.
// 이전에는 정비업체 업체명에 '검사'가 들어갔는지로 추측해 3.4만 곳 중 121곳만 잡혔다.

import { createClient } from '@supabase/supabase-js';
import {
  hashKey, nullify, toDate, toInt, toBool, isValidKrCoord, sigunguCodeFromAddress,
  runSync, resolveEnv,
} from './common.js';

const ENDPOINT = 'tn_pubr_public_car_inspofc_api';
const MAX_PAGES = 20;
const MIN_EXPECTED_ROWS = 300;

/**
 * 운영시간 문자열 → 시작/종료 분리. 원천이 자유 형식이라 실패할 수 있다.
 * 실패하면 원문을 open 에 보존한다 — 어설프게 쪼갠 값을 단정해 보여주는 것보다 정직하다.
 */
function splitOperTime(raw) {
  const s = nullify(raw);
  if (!s) return { open: null, close: null };
  const m = s.match(/(\d{1,2}):?(\d{2})\s*[~\-–]\s*(\d{1,2}):?(\d{2})/);
  if (!m) return { open: s, close: null };
  const pad = (h, mm) => `${String(h).padStart(2, '0')}:${mm}`;
  return { open: pad(m[1], m[2]), close: pad(m[3], m[4]) };
}

/**
 * 원문 → inspection_stations 행.
 *
 * ⚠️ 전화번호가 두 개다 — inspofcPhoneNumber = 검사소 번호(표시용),
 *    phoneNumber = 관리기관(관청) 번호(표시 금지). 정비업체 API 와 이름은 같고 의미가 다르다.
 */
function normalize(items, syncedAt) {
  const stats = { total: items.length, dropped: { noName: 0, badCoord: 0 }, withCapability: 0 };
  const byKey = new Map();

  for (const it of items) {
    const name = nullify(it.inspofcNm);
    if (!name) { stats.dropped.noName++; continue; }

    const lat = Number(nullify(it.latitude));
    const lng = Number(nullify(it.longitude));
    if (!isValidKrCoord(lat, lng)) { stats.dropped.badCoord++; continue; }

    const caps = {
      can_new: toBool(it.newInspofcYn),
      can_regular: toBool(it.fdrmInspofcYn),
      can_tuning: toBool(it.tuningInspofcYn),
      can_temporary: toBool(it.tempInspofcYn),
      can_repair: toBool(it.repairInspofcYn),
      can_emission: toBool(it.exhstGasInspofcYn),
      can_taximeter: toBool(it.taxiMeterYn),
    };
    if (Object.values(caps).some((v) => v !== null)) stats.withCapability++;

    const addr = nullify(it.rdnmadr) ?? nullify(it.lnmadr);
    const { open, close } = splitOperTime(it.operTime);
    const key = hashKey([name, addr ?? '']);
    byKey.set(key, {
      place_key: key,
      name,
      office_type: nullify(it.inspofcType),
      road_addr: nullify(it.rdnmadr),
      jibun_addr: nullify(it.lnmadr),
      tel: nullify(it.inspofcPhoneNumber),
      open_time: open,
      close_time: close,
      lane_count: toInt(it.inspofcCo),
      staff_count: toInt(it.inspofcHnfCo),
      ...caps,
      lat,
      lng,
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      sigungu_code: sigunguCodeFromAddress(addr),
      data_base_date: toDate(it.referenceDate),
      synced_at: syncedAt,
    });
  }
  return { rows: [...byKey.values()], stats };
}

export async function runInspectionSync({ dryRun = false, maxPages = MAX_PAGES } = {}) {
  const env = resolveEnv();
  if (env.error) return { ok: false, error: env.error };
  const sb = createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } });
  return runSync(sb, {
    endpoint: ENDPOINT,
    table: 'inspection_stations',
    conflictKey: 'place_key',
    normalize,
    key: env.key,
    maxPages: Math.min(Math.max(1, maxPages), MAX_PAGES),
    minExpectedRows: MIN_EXPECTED_ROWS,
    dryRun,
  });
}
