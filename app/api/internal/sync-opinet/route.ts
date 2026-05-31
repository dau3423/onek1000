// Cron (1일 1회) — 시군구별 최저가 TOP10(전국 고른 분포) + 시도별 평균가 동기화
// Authorization: Bearer ${CRON_SECRET}
// USE_MOCK=true 거나 Supabase 미설정인 경우 skip.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { redis, keys } from '@/lib/cache/redis';
import { sendPush } from '@/lib/push/webpush';
import { queryRegionTop10 } from '@/lib/db/queries';
import { katecToWgs84 } from '@/lib/map/katec';
import { PRODUCT_LABEL, BRAND_LABEL, type BrandCode, type SidoCode, type ProductCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 시군구 단위 적재로 lowTop10 호출이 ~1,000회(시군구 ~250 × 4유종)로 늘었다.
// 동시성 제한(아래 CONCURRENCY) 때문에 호출이 직렬에 가깝게 흘러 수십 초~분 단위가
// 걸릴 수 있어 충분히 상향한다. Cloud Run/App Hosting 요청 타임아웃 허용 범위 내(기본 최대 3600s).
export const maxDuration = 300;

const SIDOS: SidoCode[] = ['01','02','03','04','05','06','07','08','09','10','11','14','15','16','17','18','19'];
// 취급 4종 — 휘발유/경유/고급휘발유/LPG. (실내등유 K015 제외)
// stale 삭제 범위·과삭제 가드(실패율 기반)·평균가/TOP 조회 루프가 모두 이 배열을
// 단일 소스로 참조하므로 여기만 바꾸면 일관 확장된다.
const PRODUCTS: ProductCode[] = ['B027', 'D047', 'B034', 'C004'];

// lowTop10.do(area=시군구4자리)는 "그 시군구 최저가 TOP10"을 반환한다.
// cnt를 키워도 시군구당 10개로 캡되므로 10으로 고정한다.
const TOP_CNT = 10;

// 대량 적재 대비: 단일 배치 upsert/insert는 행이 수천~수만이면 payload 크기·DB 타임아웃
// 위험이 있어 청크 단위로 분할해 순차 처리한다.
const UPSERT_CHUNK = 1000;

// Opinet 동시호출 제한 — 시군구×유종 ~1,000회를 Promise.all로 한꺼번에 쏘면
// Opinet이 순간 차단해 빈 응답(0건)을 준다(실측). 동시 실행 수를 이 값으로 묶는다.
const CONCURRENCY = 6;
// 동시 호출 풀이 한 슬롯 비울 때마다 다음 요청을 곧장 던지므로 폭주를 막기 위해
// 각 호출 직후 짧은 지연을 둔다(throttle 회피용 완충).
const REQUEST_DELAY_MS = 60;

const OPINET_BASE = 'https://www.opinet.co.kr/api';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 동시 실행 수를 limit개로 제한하는 워커 풀(p-limit류 패턴, 외부 의존 없이 직접 구현).
// items 순서대로 worker를 호출하되 동시에 살아있는 작업이 limit개를 넘지 않도록 한다.
// 입력 순서와 무관한 결과 누적을 가정한다(각 worker가 부수효과/배열 push로 처리).
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

// areaCode.do?area={시도2자리} → 그 시도의 시군구 코드(4자리) 목록.
// 응답: RESULT.OIL = [{ AREA_CD: '0201', AREA_NM: '수원시' }, ...]
async function opinetAreaCodes(sido: SidoCode): Promise<Array<{ code: string; name: string }>> {
  const key = process.env.OPINET_API_KEY;
  if (!key) throw new Error('OPINET_API_KEY missing');
  const url = `${OPINET_BASE}/areaCode.do?out=json&code=${key}&area=${sido}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`opinet ${res.status}`);
  const data = await res.json();
  const list = (data?.RESULT?.OIL ?? []) as Array<{ AREA_CD?: string; AREA_NM?: string }>;
  return list
    .map((a) => ({ code: String(a.AREA_CD ?? '').trim(), name: String(a.AREA_NM ?? '').trim() }))
    .filter((a) => a.code.length === 4);
}

// lowTop10.do(area=시군구4자리) → 그 시군구 최저가 TOP10.
async function opinetLowTop10(area: string, prod: ProductCode, cnt = TOP_CNT) {
  const key = process.env.OPINET_API_KEY;
  if (!key) throw new Error('OPINET_API_KEY missing');
  const url = `${OPINET_BASE}/lowTop10.do?out=json&code=${key}&area=${area}&prodcd=${prod}&cnt=${cnt}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`opinet ${res.status}`);
  const data = await res.json();
  return data?.RESULT?.OIL ?? [];
}

// 배열을 size 단위로 잘라 순차 처리. 청크별 콜백이 에러 객체를 반환하면 즉시 throw.
async function inChunks<T>(
  rows: T[],
  size: number,
  fn: (chunk: T[]) => Promise<{ error: { message: string } | null }>,
  label: string,
) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await fn(chunk);
    if (error) throw new Error(`${label} failed (rows ${i}-${i + chunk.length}): ${error.message}`);
  }
}

async function opinetAvgSido(prod: ProductCode) {
  const key = process.env.OPINET_API_KEY;
  if (!key) throw new Error('OPINET_API_KEY missing');
  const url = `${OPINET_BASE}/avgSidoPrice.do?out=json&code=${key}&prodcd=${prod}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`opinet ${res.status}`);
  const data = await res.json();
  return data?.RESULT?.OIL ?? [];
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured() || !process.env.OPINET_API_KEY) {
    return NextResponse.json({ skipped: true, reason: 'mock mode or missing config' });
  }

  const sb = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const fetchErrors: string[] = [];
  let opinetCalls = 0; // Opinet 호출 누적(일일 한도 1,500 모니터링용)

  // 1) 시도별 평균가 → Redis (4종, 동시성 제한)
  await mapWithConcurrency(PRODUCTS, CONCURRENCY, async (prod) => {
    opinetCalls++;
    try {
      const list = await opinetAvgSido(prod);
      await redis.setJson(keys.avgSido(prod), list, 3600);
    } catch (e) {
      fetchErrors.push(`avg ${prod}: ${(e as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  });

  // 2) 시도(17개)별 areaCode → 전국 시군구 코드 목록(~250개) 수집 (동시성 제한)
  const sigungus: Array<{ code: string; sido: SidoCode }> = [];
  let areaFetchFailed = 0;
  await mapWithConcurrency(SIDOS, CONCURRENCY, async (sido) => {
    opinetCalls++;
    try {
      const list = await opinetAreaCodes(sido);
      for (const a of list) sigungus.push({ code: a.code, sido });
    } catch (e) {
      areaFetchFailed++;
      fetchErrors.push(`area ${sido}: ${(e as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  });

  // 3) (시군구 × 4유종)마다 lowTop10(area=시군구4자리) 조회 — ~1,000회, 동시성 제한.
  //    Promise.all로 한꺼번에 쏘면 Opinet이 throttle해 빈 응답을 주므로 풀로 묶는다.
  const jobs = sigungus.flatMap(({ code, sido }) => PRODUCTS.map((prod) => ({ code, sido, prod })));
  const lists: Array<{ code: string; sido: SidoCode; prod: ProductCode; oils: any[] }> = [];
  let topFetchFailed = 0; // fetch 자체 실패(=catch) job 수. stale 과삭제 가드용.
  await mapWithConcurrency(jobs, CONCURRENCY, async ({ code, sido, prod }) => {
    opinetCalls++;
    try {
      lists.push({ code, sido, prod, oils: await opinetLowTop10(code, prod) });
    } catch (e) {
      topFetchFailed++;
      fetchErrors.push(`top ${code}/${prod}: ${(e as Error).message}`);
      lists.push({ code, sido, prod, oils: [] as any[] });
    }
    await sleep(REQUEST_DELAY_MS);
  });

  // 응답 행 누적 — 주유소는 id 기준, 가격은 (station_id, product) 기준으로 dedupe
  const stationMap = new Map<string, Record<string, unknown>>();
  const priceMap = new Map<string, Record<string, unknown>>();
  const history: Array<{ station_id: string; product: ProductCode; price: number }> = [];

  let coordSkipped = 0;
  for (const { code, sido, prod, oils } of lists) {
    for (const o of oils) {
      const id = o.UNI_ID as string;
      if (!id) continue;

      // Opinet 좌표는 KATEC(미터)이며 필드명은 GIS_X_COOR / GIS_Y_COOR 다.
      // (기존 코드는 GIS_X_COORD 로 잘못 읽어 lat/lng=undefined → geom insert 실패 → DB 비어 있었음)
      const wgs = katecToWgs84(Number(o.GIS_X_COOR), Number(o.GIS_Y_COOR));
      if (!wgs) { coordSkipped++; continue; }

      const brand = (o.POLL_DIV_CD ?? 'ETC') as BrandCode;
      stationMap.set(id, {
        id,
        brand_code: brand,
        brand_name: BRAND_LABEL[brand] ?? BRAND_LABEL.ETC,
        name: o.OS_NM,
        sido_code: sido,
        sigungu_code: code,
        address: o.NEW_ADR ?? o.VAN_ADR ?? null,
        lat: wgs.lat,
        lng: wgs.lng,
        // PostGIS WKT 입력 (Supabase는 geography에 WKT 자동 캐스팅 지원)
        geom: `SRID=4326;POINT(${wgs.lng} ${wgs.lat})`,
        updated_at: now,
      });
      priceMap.set(`${id}|${prod}`, {
        station_id: id,
        product: prod,
        price: o.PRICE,
        trade_dt: o.TRADE_DT ?? today,
        updated_at: now,
      });
      history.push({ station_id: id, product: prod, price: o.PRICE });
    }
  }
  if (coordSkipped) fetchErrors.push(`coord skipped: ${coordSkipped}`);

  const stationRows = [...stationMap.values()];
  const priceRows = [...priceMap.values()];

  // 청크 분할 UPSERT/INSERT — 시군구 단위 적재로 행이 수천~수만이 되어도
  // payload 크기·DB 타임아웃을 피하도록 UPSERT_CHUNK(1000)씩 나눠 순차 처리한다.
  await inChunks(stationRows, UPSERT_CHUNK,
    async (chunk) => await sb.from('stations').upsert(chunk, { onConflict: 'id' }),
    'stations upsert');
  await inChunks(priceRows, UPSERT_CHUNK,
    async (chunk) => await sb.from('prices_latest').upsert(chunk, { onConflict: 'station_id,product' }),
    'prices_latest upsert');
  await inChunks(history, UPSERT_CHUNK,
    async (chunk) => await sb.from('prices_history').insert(chunk),
    'prices_history insert');

  const stationUpserts = stationRows.length;
  const priceUpserts = priceRows.length;

  // ─── stale 가격 정리 ───
  // lowTop10.do(area=시군구)는 "현재 시군구×유종 최저가 TOP10"만 돌려준다. 한 번 목록에 들었다가
  // 가격이 올라 목록에서 빠진 주유소의 prices_latest 행은 UPSERT만으로는 지워지지 않아
  // 영구히 stale로 남고, 그 옛 가격이 top10/bbox/radius "최저가" 순위를 오염시킨다.
  // (실제 사례: 다향주유소 D047=1619가 잔존해 1위로 표시, 실제 현재가는 1995)
  //
  // 매 실행마다 전 시군구×PRODUCTS(4종)를 재수집하므로, 이번 run에서 보고되지 않은
  // (= updated_at < runStartedAt) 행은 stale로 간주해 삭제한다.
  //
  // 삭제 범위는 product 화이트리스트로 한정하지 않고 updated_at < now 단일 조건으로 둔다.
  // 이번 run에 보고된 행만 살아남고(updated_at=now), 미보고 행은 유종과 무관하게
  // 자연히 정리된다(과거 취급 유종 변경 시 잔존할 orphan 행도 함께 청소된다).
  //
  // 안전 가드: Opinet fetch가 대량 실패하면 priceRows가 비정상적으로 적어지고,
  // 그 상태로 stale 정리를 돌리면 prices_latest가 통째로 비는 사고가 난다.
  // → 판정 기준을 "fetch 실패율"로 둔다. fetch 실패 job이 전체의 절반 미만이고
  //   적재 행이 1건 이상이면 데이터가 신뢰 가능하다고 보고 stale 정리를 진행한다.
  const STALE_GUARD_MAX_FAIL_RATIO = 0.5;
  const failRatio = jobs.length ? topFetchFailed / jobs.length : 1;
  let staleDeleted = 0;
  let staleSkipped = false;
  if (priceRows.length > 0 && failRatio < STALE_GUARD_MAX_FAIL_RATIO) {
    // 이번 run 시작 시각(now)보다 오래된 updated_at = 이번에 보고되지 않은 행.
    // UPSERT가 모두 성공한 뒤 실행하므로 신규/갱신 행은 updated_at=now 로 보존된다.
    // product 제약을 두지 않아 과거 취급 유종 변경으로 남은 orphan 행도 함께 정리된다.
    const { data: deleted, error } = await sb
      .from('prices_latest')
      .delete()
      .lt('updated_at', now)
      .select('station_id'); // 삭제 건수 집계용
    if (error) {
      fetchErrors.push(`stale cleanup failed: ${error.message}`);
    } else {
      staleDeleted = deleted?.length ?? 0;
    }
  } else {
    staleSkipped = true;
    fetchErrors.push(
      `stale cleanup skipped: priceRows ${priceRows.length}, fetchFailed ${topFetchFailed}/${jobs.length} (ratio ${failRatio.toFixed(2)})`,
    );
  }

  // ─── 가격 변동 감지 → 프리미엄 사용자에게 푸시 ───
  // 즐겨찾기 주유소 중 직전 가격 대비 30원/L 이상 떨어진 항목을 사용자별로 모음
  let pushSent = 0;
  let pushFailed = 0;

  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    // 활성/체험 중인 프리미엄 사용자 목록
    const { data: premiumUsers } = await sb
      .from('subscriptions')
      .select('user_id')
      .in('status', ['trial', 'active']);

    for (const u of premiumUsers ?? []) {
      const { data: drops } = await sb.rpc('rpc_recent_price_drops', {
        p_user_id: u.user_id, p_min_drop: 30,
      });
      if (!drops || drops.length === 0) continue;

      // 사용자의 푸시 구독 목록
      const { data: subs } = await sb
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', u.user_id);
      if (!subs || subs.length === 0) continue;

      // 가장 큰 하락 1건만 보냄 (스팸 방지)
      const top = (drops as Array<{ station_name: string; product: string; diff: number; new_price: number; station_id: string }>)
        .sort((a, b) => b.diff - a.diff)[0];
      const payload = {
        title: `⛽ ${top.station_name}`,
        body: `${PRODUCT_LABEL[top.product as ProductCode] ?? top.product} ${top.diff}원 ↓ → ₩${top.new_price.toLocaleString()}`,
        url: `/station/${top.station_id}`,
        tag: `drop-${top.station_id}-${top.product}`,
      };

      for (const sub of subs) {
        const r = await sendPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
        );
        if (r.ok) pushSent++;
        else {
          pushFailed++;
          if (r.gone) {
            // 만료 구독 정리
            await sb.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    }
  }

  // ─── 관심 지역 최저가 TOP10 변동 감지 → 푸시 ───
  // 사용자가 등록한 고정 좌표(집/회사) 반경 내 "최저가 TOP10"(가격 오름차순)을 산출한다.
  // 이 앱의 목적은 "가장 저렴한 주유소 찾기"이므로 TOP10을 알림 기준으로 삼는다.
  // 통지 조건(아래 중 하나):
  //   1) 최초 산출(직전 통지 이력 없음)
  //   2) 최저가(1위)가 REGION_MIN_DROP 이상 하락
  //   3) TOP10에 "새 주유소가 진입"(직전 집합에 없던 id가 등장)
  // 스팸 방지: 직전 통지 상태(최저가 + TOP10 집합)와 비교 + 지역당 쿨다운(6h) 내 재발송 금지.
  const REGION_MIN_DROP = 30;                         // 30원/L 이상 하락 시 통지
  const REGION_COOLDOWN_MS = 6 * 60 * 60 * 1000;      // 지역당 6시간 쿨다운
  let regionPushSent = 0;
  let regionPushFailed = 0;

  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
      // 푸시 구독이 있는 사용자만 대상 (구독 없으면 무의미)
      const { data: subRows } = await sb
        .from('push_subscriptions')
        .select('user_id, id, endpoint, p256dh, auth');
      const subsByUser = new Map<string, Array<{ id: number; endpoint: string; p256dh: string; auth: string }>>();
      for (const s of subRows ?? []) {
        const arr = subsByUser.get(s.user_id) ?? [];
        arr.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
        subsByUser.set(s.user_id, arr);
      }

      if (subsByUser.size > 0) {
        // 푸시 구독이 있는 사용자의 관심 지역만 배치 조회 (사용자×지역 N+1 회피)
        const userIds = [...subsByUser.keys()];
        const { data: regions } = await sb
          .from('interest_regions')
          .select('id, user_id, name, lat, lng, radius_m, product, last_notified_price, last_notified_station_id, last_notified_station_ids, last_notified_at')
          .in('user_id', userIds);

        const nowMs = Date.now();
        for (const reg of regions ?? []) {
          const subs = subsByUser.get(reg.user_id);
          if (!subs || subs.length === 0) continue;

          // 쿨다운: 최근 통지 후 일정 시간 내면 skip
          if (reg.last_notified_at && nowMs - new Date(reg.last_notified_at).getTime() < REGION_COOLDOWN_MS) continue;

          const top10 = await queryRegionTop10(reg.lat, reg.lng, reg.radius_m, reg.product as ProductCode);
          if (top10.length === 0) continue;

          const lowest = top10[0];
          const curIds = top10.map((t) => t.stationId);

          const prevPrice = reg.last_notified_price as number | null;
          const prevIds = (reg.last_notified_station_ids as string[] | null) ?? [];
          const prevIdSet = new Set(prevIds);

          const firstTime = prevPrice == null;
          const priceDropped = prevPrice != null && prevPrice - lowest.price >= REGION_MIN_DROP;
          // 직전 TOP10 집합에 없던 주유소가 새로 진입했는가
          const newEntry = prevIds.length > 0 && curIds.some((id) => !prevIdSet.has(id));
          if (!firstTime && !priceDropped && !newEntry) continue;

          const extra = top10.length > 1 ? ` 외 TOP${top10.length}` : '';
          const payload = {
            title: `📍 ${reg.name} 최저가`,
            body: `${PRODUCT_LABEL[reg.product as ProductCode] ?? reg.product} ₩${lowest.price.toLocaleString()} (${lowest.stationName})${extra}`,
            url: `/station/${lowest.stationId}`,
            tag: `region-${reg.id}`,
          };

          let delivered = false;
          for (const sub of subs) {
            const r = await sendPush(
              { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
              payload,
            );
            if (r.ok) { regionPushSent++; delivered = true; }
            else {
              regionPushFailed++;
              if (r.gone) await sb.from('push_subscriptions').delete().eq('id', sub.id);
            }
          }

          // 발송 성공 시에만 통지 상태 갱신 (실패 시 다음 cron에서 재시도)
          if (delivered) {
            await sb.from('interest_regions').update({
              last_notified_price: lowest.price,
              last_notified_station_id: lowest.stationId,
              last_notified_station_ids: curIds,
              last_notified_at: new Date().toISOString(),
            }).eq('id', reg.id);
          }
        }
      }
    } catch (e) {
      fetchErrors.push(`region push: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true, asOf: new Date().toISOString(),
    sidos: SIDOS.length, products: PRODUCTS.length,
    sigungus: sigungus.length, areaFetchFailed,
    topJobs: jobs.length, topFetchFailed,
    opinetCalls, // areaCode(17) + lowTop10(~1,000) + avg(4) ≈ ~1,020회 (일일 한도 1,500 이내)
    concurrency: CONCURRENCY,
    stationUpserts, priceUpserts, staleDeleted, staleSkipped,
    pushSent, pushFailed,
    regionPushSent, regionPushFailed,
    fetchErrors: fetchErrors.length ? fetchErrors : undefined,
  });
}
