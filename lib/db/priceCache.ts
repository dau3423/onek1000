// 해골 주유소 on-demand 가격 캐시 (DB 백엔드, 마이그레이션 0054)
//
// 배경: Opinet 일일 1,500콜 한도 때문에 배치(sync-opinet)는 시군구별 최저가 TOP10만
// prices_latest에 적재한다. 나머지("해골 주유소")는 상세 진입 시 detailById 1회로 채우는데,
// 그 결과를 담아둘 곳이 Redis뿐이었고 프로덕션에서 Redis가 비활성이라 저장이 no-op이 되어
// 같은 주유소를 보는 모든 요청이 매번 새 콜을 썼다. DB에 담아 주유소당 하루 1콜로 묶는다.
//
// 설계 원칙 두 가지:
//  1. prices_latest에는 절대 쓰지 않는다 — 지도 bbox/마커는 prices_latest만 보므로
//     마커 불변("비순위 주유소는 가격 마커로 뜨지 않는다")이 유지된다.
//  2. 마이그레이션 0054 미적용 환경에서도 앱이 깨지지 않는다 — 모든 함수가 실패를 흡수하고
//     "캐시 없음"으로 동작한다(= 기존 동작과 동일, Opinet 직접 호출).

import { getSupabase } from '@/lib/db/supabase';
import type { ProductCode, StationDetail } from '@/types/station';

type Prices = StationDetail['prices'];

/** 유종 코드 화이트리스트 — DB에 예상 밖 코드가 있어도 조용히 무시한다. */
const PRODUCTS: ReadonlySet<string> = new Set<ProductCode>(['B027', 'B034', 'D047', 'K015', 'C004']);

/**
 * 테이블 미배포(0054 미적용) 로그를 한 번만 남기기 위한 플래그.
 * 매 요청마다 같은 경고를 찍으면 로그가 쓸모없어진다.
 */
let missingTableWarned = false;

/** 그 밖의 오류는 where별로 이 간격(ms) 안에 한 번만 찍는다 — 지속적 장애 시 로그 폭주 방지. */
const WARN_THROTTLE_MS = 60_000;
const lastWarnAt = new Map<string, number>();

/**
 * 0054 미적용(테이블 없음) 판정.
 * PostgREST는 스키마 캐시에 없는 릴레이션에 PGRST205 + "Could not find the table ..."을 주고,
 * Postgres 직접 오류로 새어 나올 때는 42P01 + "... does not exist"를 준다. 둘 다 받는다.
 */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = error.message ?? '';
  return /does not exist/i.test(msg) || /could not find the table/i.test(msg);
}

function warnOnce(where: string, error: { code?: string; message?: string } | null) {
  if (isMissingTable(error)) {
    if (!missingTableWarned) {
      missingTableWarned = true;
      console.warn('[priceCache] migration 0054 미적용 — on-demand 가격 캐시 없이 동작한다(기존 동작과 동일)');
    }
    return;
  }
  const now = Date.now();
  if (now - (lastWarnAt.get(where) ?? 0) < WARN_THROTTLE_MS) return;
  lastWarnAt.set(where, now);
  console.warn(`[priceCache] ${where} 실패`, error?.message ?? error);
}

/** 현재 시각 기준 다음 KST(UTC+9) 자정 — Opinet 가격 갱신 주기와 맞춘 만료 시각. */
export function nextKstMidnight(): Date {
  const KST_OFFSET_MS = 9 * 3600 * 1000;
  const dayMs = 24 * 3600 * 1000;
  const nowKst = Date.now() + KST_OFFSET_MS;
  const sinceMidnight = ((nowKst % dayMs) + dayMs) % dayMs;
  return new Date(Date.now() + (dayMs - sinceMidnight));
}

/**
 * 미만료 on-demand 가격을 읽는다.
 * @returns 하나라도 있으면 prices 부분맵, 없거나 조회 실패면 null(→ 호출부는 Opinet 조회로 진행).
 */
export async function readOndemandPrices(stationId: string): Promise<Partial<Prices> | null> {
  try {
    const { data, error } = await getSupabase()
      .from('prices_ondemand')
      .select('product, price, trade_dt')
      .eq('station_id', stationId)
      .gt('expires_at', new Date().toISOString());
    if (error) { warnOnce('read', error); return null; }
    if (!data?.length) return null;

    const out: Partial<Prices> = {};
    for (const r of data as { product: string; price: number; trade_dt: string | null }[]) {
      if (!PRODUCTS.has(r.product)) continue;
      out[r.product as ProductCode] = { price: r.price, tradeDate: r.trade_dt ?? '' };
    }
    return Object.keys(out).length ? out : null;
  } catch (e) {
    warnOnce('read', e as { message?: string });
    return null;
  }
}

/**
 * Opinet에서 받은 가격을 캐시에 적재한다(KST 자정 만료). best-effort — 실패해도 응답에 영향 없음.
 * null 유종은 저장하지 않는다(그 유종을 안 파는 주유소와 "아직 모름"을 구분할 필요가 없다).
 */
export async function writeOndemandPrices(stationId: string, prices: Prices): Promise<void> {
  const expiresAt = nextKstMidnight().toISOString();
  const rows = Object.entries(prices)
    .filter((e): e is [string, { price: number; tradeDate: string }] => e[1] != null)
    .map(([product, v]) => ({
      station_id: stationId, product, price: v.price, trade_dt: v.tradeDate, expires_at: expiresAt,
    }));
  if (!rows.length) return;
  try {
    const { error } = await getSupabase()
      .from('prices_ondemand')
      .upsert(rows, { onConflict: 'station_id,product' });
    if (error) warnOnce('write', error);
  } catch (e) {
    warnOnce('write', e as { message?: string });
  }
}

/**
 * 전역 쿨다운을 걸 만한 실패 사유 — 인프라/할당량처럼 **모든 주유소에 공통**인 신호만 담는다.
 * "응답은 왔는데 그 주유소 가격이 없음"은 개별 사정이므로 여기 없다(전역 쿨다운을 걸면
 * 한 주유소 때문에 다른 모든 해골 주유소의 보강이 막힌다).
 * 마이그레이션 0054의 reason 컬럼 주석에는 'empty'도 적혀 있으나 현재 코드는 쓰지 않는다.
 */
export type CooldownReason = 'timeout' | 'error';

/** 전역 쿨다운이 걸려 있으면 true(→ Opinet 호출 생략). 조회 실패는 false(= 기존 동작 유지). */
export async function isOpinetCoolingDown(): Promise<boolean> {
  try {
    const { data, error } = await getSupabase()
      .from('opinet_cooldown')
      .select('until')
      .eq('id', true)
      .maybeSingle();
    if (error) { warnOnce('cooldown read', error); return false; }
    return Boolean(data?.until && new Date(data.until as string).getTime() > Date.now());
  } catch (e) {
    warnOnce('cooldown read', e as { message?: string });
    return false;
  }
}

/** 전역 쿨다운을 건다. best-effort. */
export async function setOpinetCooldown(reason: CooldownReason, minutes: number): Promise<void> {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  try {
    const { error } = await getSupabase()
      .from('opinet_cooldown')
      .upsert({ id: true, reason, until, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) warnOnce('cooldown write', error);
  } catch (e) {
    warnOnce('cooldown write', e as { message?: string });
  }
}
