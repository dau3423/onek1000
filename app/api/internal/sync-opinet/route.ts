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

// 부가서비스 회전 보강 예산 — detailById.do는 주유소 1건당 1콜이라 전 주유소를 매일 보강할 수 없다.
// 가격 sync(areaCode 17 + lowTop10 ~1,000 + avg 4 ≈ ~1,020콜) 뒤 남는 일일 한도 안에서
// amenities_updated_at이 가장 오래된(또는 미보강) 주유소부터 이만큼만 보강해 며칠에 걸쳐 전체를 순회한다.
// 한도(1,500) - 가격 sync(~1,020) - 안전 여유(~80) ≈ 400 수준으로 잡되, 환경변수로 조정 가능.
const AMENITY_REFRESH_BUDGET = Number(process.env.OPINET_AMENITY_BUDGET ?? 400);

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

// detailById.do(id) → 주유소 1건 상세(부가서비스 포함). 가격 API에는 없는
// CAR_WASH_YN/CVS_YN/MAINT_YN/KPETRO_YN/LPG_YN 를 여기서만 얻는다.
interface OpinetDetailOil {
  UNI_ID?: string;
  OS_NM?: string;
  CAR_WASH_YN?: string;
  CVS_YN?: string;
  MAINT_YN?: string;
  KPETRO_YN?: string;
  LPG_YN?: string;
}
async function opinetDetailById(id: string): Promise<OpinetDetailOil | null> {
  const key = process.env.OPINET_API_KEY;
  if (!key) throw new Error('OPINET_API_KEY missing');
  const url = `${OPINET_BASE}/detailById.do?out=json&code=${key}&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`opinet ${res.status}`);
  const data = await res.json();
  return (data?.RESULT?.OIL?.[0] as OpinetDetailOil | undefined) ?? null;
}

// detailById 응답이 "정상 데이터"인지 판정.
// Opinet 할당량 소진/일시오류 시 HTTP 200 이지만 RESULT.OIL=[] (빈 배열)을 준다.
// 이 경우 opinetDetailById 는 null 을 반환한다(OIL[0] 없음).
// 또한 OIL[0] 이 있어도 핵심 식별 필드(UNI_ID / OS_NM)가 비면 신뢰할 수 없는 응답으로 본다.
// 정상 응답일 때만 부가서비스 플래그 매핑 + amenities_updated_at 기록을 허용한다.
function isValidDetail(d: OpinetDetailOil | null): d is OpinetDetailOil {
  if (!d) return false;
  const hasId = String(d.UNI_ID ?? '').trim().length > 0;
  const hasName = String(d.OS_NM ?? '').trim().length > 0;
  return hasId && hasName;
}

const isY = (v?: string) => String(v ?? '').trim().toUpperCase() === 'Y';
// LPG_YN 은 업종구분(N:주유소, Y:충전소, C:겸업) — Y/C 면 LPG 취급으로 본다.
const hasLpgFrom = (v?: string) => {
  const t = String(v ?? '').trim().toUpperCase();
  return t === 'Y' || t === 'C';
};

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
  // 빈 응답(0건) job 수. Opinet 할당량 소진 시 HTTP 200 + RESULT.OIL=[] 를 주므로
  // catch(=topFetchFailed)로는 절대 안 잡힌다. stale 과삭제를 막는 핵심 신호다.
  let topEmpty = 0;
  await mapWithConcurrency(jobs, CONCURRENCY, async ({ code, sido, prod }) => {
    opinetCalls++;
    try {
      const oils = await opinetLowTop10(code, prod);
      if (!Array.isArray(oils) || oils.length === 0) topEmpty++;
      lists.push({ code, sido, prod, oils: Array.isArray(oils) ? oils : [] });
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
  // 안전 가드 (3중) — "이번 sync가 충분히 완전할 때만" stale 정리를 실행한다.
  // 부분/할당량소진 의심 시 정리를 완전 스킵해 오래된 가격을 그대로 유지한다.
  // (stale 가격이 남는 것은 가격이 통째로 삭제돼 지도에서 사라지는 사고보다 훨씬 낫다.)
  //
  // [사고 원인] 기존 가드는 fetch 실패율(topFetchFailed)만 봤다. 그러나 Opinet은 일일
  // 할당량 소진 시 에러가 아니라 HTTP 200 + RESULT.OIL=[] (빈 응답)을 준다. 이 빈 응답은
  // catch에 걸리지 않아 topFetchFailed가 0인 채로 가드를 통과했고, "그 시군구엔 주유소
  // 없음"으로 오인해 미수신 지역(~2,700행)의 가격을 전부 삭제했다(3,788→1,103).
  //
  // 판정 신호(아래 중 하나라도 해당하면 cleanup 스킵):
  //   (A) fetch 실패율 ≥ 0.5            — 기존 가드 유지.
  //   (B) 빈 응답(0건) job 비율 ≥ 0.4   — 할당량 소진 의심(빈 응답이 다수면 받은 게 적음).
  //   (C) 이번 priceUpserts < 기존 prices_latest 행수 × 0.7 — 부분 sync(급감) 의심.
  //   (D) priceRows == 0                — 받은 게 전혀 없음.
  const STALE_GUARD_MAX_FAIL_RATIO = 0.5;   // (A)
  const STALE_GUARD_MAX_EMPTY_RATIO = 0.4;  // (B)
  const STALE_GUARD_MIN_UPSERT_RATIO = 0.7; // (C)

  const failRatio = jobs.length ? topFetchFailed / jobs.length : 1;
  const emptyRatio = jobs.length ? topEmpty / jobs.length : 1;

  // 기존 prices_latest 행 수(삭제 전 기준). 부분 sync(급감) 판정 (C)에 쓴다.
  // head:true + count:'exact' 로 행을 받지 않고 카운트만 조회한다.
  // 고속도로(EX-) 가격은 highway-sync(서울 Cloud Run)가 관리하는 외부 소스라 Opinet
  // 보고분(priceUpserts)과 비교 대상이 아니다 → 카운트에서 제외해 upsertRatio 판정을 공정하게.
  let existingPriceCount: number | null = null;
  {
    const { count, error: cErr } = await sb
      .from('prices_latest')
      .select('*', { count: 'exact', head: true })
      .not('station_id', 'like', 'EX-%');
    if (cErr) {
      // 카운트 실패 시 (C) 판정 불가 → 보수적으로 0으로 두면 (C)가 항상 통과되어 위험.
      // 대신 null 로 남겨 아래에서 (C)를 "기준 미상이면 스킵" 쪽으로 처리한다.
      fetchErrors.push(`prices_latest count failed: ${cErr.message}`);
    } else {
      existingPriceCount = count ?? 0;
    }
  }
  // upsert/기존 비율 — 기존이 0(최초 sync)이면 비교 불가이므로 1로 둬 (C)를 통과시킨다.
  const upsertRatio =
    existingPriceCount && existingPriceCount > 0
      ? priceUpserts / existingPriceCount
      : 1;

  const guardFail = failRatio >= STALE_GUARD_MAX_FAIL_RATIO;   // (A)
  const guardEmpty = emptyRatio >= STALE_GUARD_MAX_EMPTY_RATIO; // (B)
  // (C): 기존 카운트를 알고(>0), 이번 upsert가 기존의 70% 미만이면 부분 sync 의심.
  //      카운트 조회 실패(null)면 안전하게 스킵 처리한다(기준 미상 = 신뢰 불가).
  const guardCountUnknown = existingPriceCount === null;
  const guardShrink =
    existingPriceCount !== null &&
    existingPriceCount > 0 &&
    upsertRatio < STALE_GUARD_MIN_UPSERT_RATIO;
  const guardEmptyRows = priceRows.length === 0; // (D)

  const staleSkipReasons: string[] = [];
  if (guardEmptyRows) staleSkipReasons.push('priceRows=0');
  if (guardFail) staleSkipReasons.push(`failRatio ${failRatio.toFixed(2)} ≥ ${STALE_GUARD_MAX_FAIL_RATIO}`);
  if (guardEmpty) staleSkipReasons.push(`emptyRatio ${emptyRatio.toFixed(2)} ≥ ${STALE_GUARD_MAX_EMPTY_RATIO}`);
  if (guardShrink) staleSkipReasons.push(`upsertRatio ${upsertRatio.toFixed(2)} < ${STALE_GUARD_MIN_UPSERT_RATIO} (upsert ${priceUpserts} / existing ${existingPriceCount})`);
  if (guardCountUnknown) staleSkipReasons.push('existing prices_latest count unknown (count query failed)');

  let staleDeleted = 0;
  const staleSkipped = staleSkipReasons.length > 0;
  if (!staleSkipped) {
    // 이번 run 시작 시각(now)보다 오래된 updated_at = 이번에 보고되지 않은 행.
    // UPSERT가 모두 성공한 뒤 실행하므로 신규/갱신 행은 updated_at=now 로 보존된다.
    // product 제약을 두지 않아 과거 취급 유종 변경으로 남은 orphan 행도 함께 정리된다.
    // 단 고속도로(EX-) 가격은 highway-sync(서울 Cloud Run)가 적재하는 외부 소스라
    // Opinet 입장에선 항상 stale로 보인다 → 제외하지 않으면 매일 삭제되어 고속도로가 지도에서 사라진다.
    const { data: deleted, error } = await sb
      .from('prices_latest')
      .delete()
      .lt('updated_at', now)
      .not('station_id', 'like', 'EX-%')
      .select('station_id'); // 삭제 건수 집계용
    if (error) {
      fetchErrors.push(`stale cleanup failed: ${error.message}`);
    } else {
      staleDeleted = deleted?.length ?? 0;
    }
  } else {
    fetchErrors.push(`stale cleanup skipped: ${staleSkipReasons.join('; ')}`);
  }

  // ─── 부가서비스 회전 보강 (detailById.do) ───
  // 가격 sync 응답(lowTop10)에는 부가서비스 필드가 없다. 부가서비스는 detailById.do(주유소 1건당 1콜)에서만
  // 오므로, 전 주유소를 매일 보강하면 Opinet 일일 한도(~1,500)를 넘는다.
  // → amenities_updated_at이 가장 오래된(또는 미보강 null) 주유소부터 AMENITY_REFRESH_BUDGET 건만
  //   순차 보강한다(동시성 제한). 며칠에 걸쳐 전체 DB를 한 바퀴 돌고, 이후엔 가장 오래된 것부터 재순회한다.
  //   상세보기는 이 컬럼(stations)만 읽으므로 상세 접근 시 Opinet 호출은 0건이다.
  let amenityRefreshed = 0;
  let amenityFailed = 0;
  // 빈 응답(할당량 소진/일시오류)으로 보강을 건너뛴 건수. amenities_updated_at 을 갱신하지 않아
  // 다음 sync 에서 다시 보강 대상이 된다(영구 오염 방지).
  let amenitySkipped = 0;
  let amenityAborted = false; // 연속 빈 응답 다수로 조기 중단했는지
  // Opinet 할당량 소진 신호: 빈 응답(또는 호출 실패)이 연속으로 이만큼 누적되면
  // 남은 호출은 어차피 빈 응답일 가능성이 높으므로 그 회차 보강을 조기 중단한다(호출 낭비 방지).
  const AMENITY_ABORT_AFTER_CONSECUTIVE_EMPTY = 20;
  if (AMENITY_REFRESH_BUDGET > 0) {
    try {
      const { data: targets, error: tErr } = await sb
        .from('stations')
        .select('id')
        .order('amenities_updated_at', { ascending: true, nullsFirst: true })
        .limit(AMENITY_REFRESH_BUDGET);
      if (tErr) throw new Error(tErr.message);

      const ids = (targets ?? []).map((t) => t.id as string);
      let consecutiveEmpty = 0; // 연속 빈 응답/실패 카운터(조기 중단 판정용)
      // 보강은 "이미 존재하는 stations 행"의 부가서비스 컬럼만 UPDATE 한다.
      // (가격 sync가 생성·UPSERT한 행이 대상이다. 보강 대상도 stations에서 뽑았으니 항상 존재한다.)
      //
      // 과거엔 upsert(onConflict:'id')로 썼는데, Supabase upsert = INSERT ... ON CONFLICT 라
      // 충돌(=기존 행 갱신)이어도 INSERT 절이 stations의 NOT NULL(brand_code 등)을 만족해야 한다.
      // payload엔 부가서비스 컬럼만 담겨 brand_code가 빠지므로 전 건이
      // "null value in column brand_code violates not-null" 으로 실패했다(amenityRefreshed=0).
      // → id 기준 UPDATE 로 바꿔 부가서비스 컬럼만 갱신한다(NOT NULL 컬럼 미관여).
      await mapWithConcurrency(ids, CONCURRENCY, async (id) => {
        // 조기 중단 후 큐에 남은 잔여 작업은 호출하지 않고 즉시 반환(Opinet 호출 절약).
        if (amenityAborted) return;
        opinetCalls++;
        let d: OpinetDetailOil | null = null;
        try {
          d = await opinetDetailById(id);
        } catch (e) {
          // detailById 호출 실패 — 보강 시각을 갱신하지 않아 다음 회차에 재시도된다.
          amenityFailed++;
          consecutiveEmpty++;
          fetchErrors.push(`amenity ${id}: ${(e as Error).message}`);
          if (consecutiveEmpty >= AMENITY_ABORT_AFTER_CONSECUTIVE_EMPTY) amenityAborted = true;
          await sleep(REQUEST_DELAY_MS);
          return;
        }

        // 빈/비정상 응답(할당량 소진·일시오류로 RESULT.OIL=[] 또는 식별 필드 결손)이면 SKIP.
        // 절대 all-false 로 기록하지 않고 amenities_updated_at 도 건드리지 않는다.
        // → 이 주유소는 다음 sync 에서 다시 보강 대상(amenities_updated_at 여전히 null/과거)이 된다.
        if (!isValidDetail(d)) {
          amenitySkipped++;
          consecutiveEmpty++;
          if (consecutiveEmpty >= AMENITY_ABORT_AFTER_CONSECUTIVE_EMPTY) {
            amenityAborted = true;
            fetchErrors.push(
              `amenity refresh aborted: ${consecutiveEmpty} consecutive empty responses (likely Opinet quota exhausted)`,
            );
          }
          await sleep(REQUEST_DELAY_MS);
          return;
        }

        // 여기부터는 정상 응답이다. 연속 빈 응답 카운터를 리셋한다.
        // (정상 응답에서 모든 부가서비스가 N 이면 all-false + 보강시각 기록이 올바른 결과다.)
        consecutiveEmpty = 0;
        const { error: uErr } = await sb
          .from('stations')
          .update({
            has_carwash: isY(d.CAR_WASH_YN),
            has_cvs: isY(d.CVS_YN),
            has_maintenance: isY(d.MAINT_YN),
            is_kpetro: isY(d.KPETRO_YN),
            has_lpg: hasLpgFrom(d.LPG_YN),
            amenities_updated_at: now,
          })
          .eq('id', id);
        // 한 건 update 실패가 다음 건을 막지 않도록 개별 처리. 매칭 행이 없으면(이론상 없음)
        // 에러 없이 0행 갱신되며, 그 경우 refreshed로 세지 않는다.
        if (uErr) {
          amenityFailed++;
          fetchErrors.push(`amenity update ${id}: ${uErr.message}`);
        } else {
          amenityRefreshed++;
        }
        await sleep(REQUEST_DELAY_MS);
      });
    } catch (e) {
      fetchErrors.push(`amenity refresh: ${(e as Error).message}`);
    }
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

    // 사용자별 기본 차량 유종 맵(일괄 조회로 N+1 회피).
    // 즐겨찾기 하락 알림은 "내 차 유종" 기준이어야 한다(예: 경유차에 경유 하락만).
    // is_default 차량이 없으면 맵에 없음 → 폴백(전체 유종 중 최대 하락, 기존 동작) 처리.
    const defaultProductByUser = new Map<string, ProductCode>();
    {
      const premiumIds = (premiumUsers ?? []).map((u) => u.user_id as string);
      if (premiumIds.length > 0) {
        const { data: vehicles } = await sb
          .from('vehicles')
          .select('user_id, fuel')
          .eq('is_default', true)
          .in('user_id', premiumIds);
        for (const v of vehicles ?? []) {
          const fuel = v.fuel as string | undefined;
          if (fuel && fuel in PRODUCT_LABEL) {
            defaultProductByUser.set(v.user_id as string, fuel as ProductCode);
          }
        }
      }
    }

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

      // 내 차 유종 기준으로 하락 항목을 필터한다(미설정이면 전체 유종 유지 = 기존 동작 폴백).
      // 휘발유 하락폭이 대체로 커서, 유종 필터 없이 최대 하락만 고르면 경유 운전자에게도
      // 휘발유 알림이 가던 문제를 차단한다. 필터 후 남은 하락이 없으면 그 사용자 알림 skip.
      const userProduct = defaultProductByUser.get(u.user_id);
      const allDrops = drops as Array<{ station_name: string; product: string; diff: number; new_price: number; station_id: string }>;
      const filtered = userProduct ? allDrops.filter((d) => d.product === userProduct) : allDrops;
      if (filtered.length === 0) continue;

      // 가장 큰 하락 1건만 보냄 (스팸 방지)
      const top = filtered.sort((a, b) => b.diff - a.diff)[0];
      const payload = {
        title: `⛽ ${top.station_name}`,
        body: `${PRODUCT_LABEL[top.product as ProductCode] ?? top.product} ${top.diff}원 ↓ → ₩${top.new_price.toLocaleString()}`,
        url: `/station/${encodeURIComponent(top.station_id)}`,
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
            url: `/station/${encodeURIComponent(lowest.stationId)}`,
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
    topJobs: jobs.length, topFetchFailed, topEmpty,
    // areaCode(17) + lowTop10(~1,000) + avg(4) ≈ ~1,020 + 부가서비스 회전 보강(최대 BUDGET)
    // ≈ ~1,420 (일일 한도 1,500 이내). BUDGET은 OPINET_AMENITY_BUDGET 로 조정.
    opinetCalls,
    concurrency: CONCURRENCY,
    stationUpserts, priceUpserts, staleDeleted, staleSkipped,
    // stale cleanup 판정 지표 — 운영 가시성(부분/할당량소진 진단)용.
    staleGuard: {
      failRatio: Number(failRatio.toFixed(3)),
      emptyRatio: Number(emptyRatio.toFixed(3)),
      existingPriceCount,
      upsertRatio: Number(upsertRatio.toFixed(3)),
      reasons: staleSkipped ? staleSkipReasons : undefined,
    },
    amenityBudget: AMENITY_REFRESH_BUDGET, amenityRefreshed, amenityFailed, amenitySkipped, amenityAborted,
    pushSent, pushFailed,
    regionPushSent, regionPushFailed,
    fetchErrors: fetchErrors.length ? fetchErrors : undefined,
  });
}
