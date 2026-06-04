// 고속도로(휴게소) 주유소 sync 본체.
// === app/api/internal/sync-highway/route.ts 에서 포팅 ===
// 적재 규칙은 라우트와 동일하게 유지(id 'EX:'+code, brand EXP/'고속도로', is_highway=true,
// prices_latest onConflict(station_id,product) + prices_history insert, 좌표 캐시 재지오코딩 생략,
// 청크 upsert 500, 좌표 못 구하면 적재 보류).

import { createClient } from '@supabase/supabase-js';
import { fetchAllHighwayStations, isExoilConfigured } from './exoil.js';
import { geocode, isGeocodeConfigured } from './geocode.js';

// types/station.ts BRAND_LABEL.EXP 값과 일치시킨다.
const EX_ID_PREFIX = 'EX:';
const EX_BRAND = 'EXP';
const EX_BRAND_NAME = '고속도로';
// 고속도로 주유소는 행정구역 sido 코드를 알 수 없어 NOT NULL 충족용 폴백값(라우트와 동일).
const EX_SIDO_FALLBACK = '02';

const UPSERT_CHUNK = 500;
const GEOCODE_DELAY_MS = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getSupabase() {
  // 메인 앱은 NEXT_PUBLIC_SUPABASE_URL 을 쓰지만, 이 서비스에선 SUPABASE_URL 우선 + 폴백.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'highway-sync-cloudrun' } },
  });
}

function isSupabaseConfigured() {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * @param {{ dryRun?: boolean }} [opts] dryRun=true 면 수집/지오코딩까지만, upsert 생략(스모크용).
 * @returns {Promise<object>} JSON 요약
 */
export async function runHighwaySync(opts = {}) {
  const dryRun = Boolean(opts.dryRun);

  if (!isSupabaseConfigured() || !isExoilConfigured()) {
    return { skipped: true, reason: 'supabase or EX_API_KEY missing' };
  }

  const sb = dryRun ? null : getSupabase();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const errors = [];

  // 1) 도로공사 가격 API 전량 수집(모든 페이지). 가격 없는 행은 client에서 제외됨.
  const highway = await fetchAllHighwayStations();
  if (highway.length === 0) {
    return { ok: true, asOf: now, fetched: 0, note: 'no highway stations returned' };
  }

  // 2) 기존 EX 좌표 캐시 — 이미 좌표가 있는 휴게소는 재지오코딩하지 않는다(카카오 호출 절약).
  const ids = highway.map((h) => EX_ID_PREFIX + h.code);
  const coordCache = new Map();
  if (sb) {
    for (let i = 0; i < ids.length; i += UPSERT_CHUNK) {
      const chunk = ids.slice(i, i + UPSERT_CHUNK);
      const { data } = await sb.from('stations').select('id, lat, lng').in('id', chunk);
      for (const r of data ?? []) {
        if (r.lat != null && r.lng != null) coordCache.set(r.id, { lat: r.lat, lng: r.lng });
      }
    }
  }

  // 3) 좌표 확보(없는 건만 지오코딩) + station/price 행 구성.
  const stationRows = [];
  const priceRows = [];
  const history = [];
  const geocodeEnabled = isGeocodeConfigured();
  let geocoded = 0;
  let coordSkipped = 0;
  let coordCached = 0;

  for (const h of highway) {
    const id = EX_ID_PREFIX + h.code;
    let coord = coordCache.get(id) ?? null;
    if (coord) {
      coordCached++;
    } else if (geocodeEnabled) {
      coord = await geocode(h.address, h.name);
      if (coord) geocoded++;
      await sleep(GEOCODE_DELAY_MS);
    }

    // 좌표를 못 구한 휴게소는 적재 보류(NOT NULL geom 충족 불가 + 지도 표시 불가).
    if (!coord) {
      coordSkipped++;
      continue;
    }

    stationRows.push({
      id,
      brand_code: EX_BRAND,
      brand_name: EX_BRAND_NAME,
      name: h.name,
      sido_code: EX_SIDO_FALLBACK,
      sigungu_code: null,
      address: h.address,
      tel: h.tel,
      is_self: false,
      is_highway: true,
      route_name: h.routeName,
      direction: h.direction,
      lat: coord.lat,
      lng: coord.lng,
      geom: `SRID=4326;POINT(${coord.lng} ${coord.lat})`,
      updated_at: now,
    });

    for (const [product, price] of Object.entries(h.prices)) {
      priceRows.push({ station_id: id, product, price, trade_dt: today, updated_at: now });
      history.push({ station_id: id, product, price });
    }
  }

  if (coordSkipped) errors.push(`coord skipped(no geocode): ${coordSkipped}`);

  if (stationRows.length === 0) {
    return {
      ok: true,
      asOf: now,
      fetched: highway.length,
      stationUpserts: 0,
      priceUpserts: 0,
      geocoded,
      coordCached,
      coordSkipped,
      note: geocodeEnabled ? 'all geocode failed' : 'geocode key missing (KAKAO_REST_API_KEY)',
      errors: errors.length ? errors : undefined,
    };
  }

  // dryRun: upsert 생략하고 수집/지오코딩 결과만 반환(운영 DB 미변경).
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      asOf: now,
      fetched: highway.length,
      stationUpserts: stationRows.length,
      priceUpserts: priceRows.length,
      geocoded,
      coordCached,
      coordSkipped,
      errors: errors.length ? errors : undefined,
    };
  }

  // 4) UPSERT — stations 먼저(가격 FK가 stations.id 참조), 그 다음 prices_latest/history.
  const inChunks = async (rows, fn, label) => {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK);
      const { error } = await fn(chunk);
      if (error) throw new Error(`${label} failed (rows ${i}-${i + chunk.length}): ${error.message}`);
    }
  };

  await inChunks(
    stationRows,
    (chunk) => sb.from('stations').upsert(chunk, { onConflict: 'id' }),
    'stations upsert',
  );
  await inChunks(
    priceRows,
    (chunk) => sb.from('prices_latest').upsert(chunk, { onConflict: 'station_id,product' }),
    'prices_latest upsert',
  );
  await inChunks(history, (chunk) => sb.from('prices_history').insert(chunk), 'prices_history insert');

  return {
    ok: true,
    asOf: now,
    fetched: highway.length,
    stationUpserts: stationRows.length,
    priceUpserts: priceRows.length,
    geocoded,
    coordCached,
    coordSkipped,
    errors: errors.length ? errors : undefined,
  };
}
