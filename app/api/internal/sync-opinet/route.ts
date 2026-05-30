// Vercel Cron (매시간) — 시도별 TOP20 + 시도별 평균가 동기화
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
export const maxDuration = 120;

const SIDOS: SidoCode[] = ['01','02','03','04','05','06','07','08','09','10','11','14','15','16','17','18','19'];
const PRODUCTS: ProductCode[] = ['B027', 'D047'];

const OPINET_BASE = 'https://www.opinet.co.kr/api';

async function opinetLowTop10(area: SidoCode, prod: ProductCode, cnt = 20) {
  const key = process.env.OPINET_API_KEY;
  if (!key) throw new Error('OPINET_API_KEY missing');
  const url = `${OPINET_BASE}/lowTop10.do?out=json&code=${key}&area=${area}&prodcd=${prod}&cnt=${cnt}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`opinet ${res.status}`);
  const data = await res.json();
  return data?.RESULT?.OIL ?? [];
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

  // 1) 시도별 평균가 → Redis (병렬)
  await Promise.all(
    PRODUCTS.map(async (prod) => {
      try {
        const list = await opinetAvgSido(prod);
        await redis.setJson(keys.avgSido(prod), list, 3600);
      } catch (e) {
        fetchErrors.push(`avg ${prod}: ${(e as Error).message}`);
      }
    }),
  );

  // 2) 시도×유종 TOP20 전체를 병렬로 조회 (이전엔 순차 호출이라 60초 초과로 미완료됨)
  const jobs = SIDOS.flatMap((sido) => PRODUCTS.map((prod) => ({ sido, prod })));
  const lists = await Promise.all(
    jobs.map(async ({ sido, prod }) => {
      try {
        return { sido, prod, oils: await opinetLowTop10(sido, prod) };
      } catch (e) {
        fetchErrors.push(`top ${sido}/${prod}: ${(e as Error).message}`);
        return { sido, prod, oils: [] as any[] };
      }
    }),
  );

  // 응답 행 누적 — 주유소는 id 기준, 가격은 (station_id, product) 기준으로 dedupe
  const stationMap = new Map<string, Record<string, unknown>>();
  const priceMap = new Map<string, Record<string, unknown>>();
  const history: Array<{ station_id: string; product: ProductCode; price: number }> = [];

  let coordSkipped = 0;
  for (const { sido, prod, oils } of lists) {
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

  // 배치 UPSERT (행 단위 await 루프 제거 → 라운드트립 수백 회 → 수 회로 감소)
  if (stationRows.length) {
    const { error } = await sb.from('stations').upsert(stationRows, { onConflict: 'id' });
    if (error) throw new Error(`stations upsert failed: ${error.message}`);
  }
  if (priceRows.length) {
    const { error } = await sb.from('prices_latest').upsert(priceRows, { onConflict: 'station_id,product' });
    if (error) throw new Error(`prices_latest upsert failed: ${error.message}`);
  }
  if (history.length) {
    await sb.from('prices_history').insert(history);
  }

  const stationUpserts = stationRows.length;
  const priceUpserts = priceRows.length;

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
    stationUpserts, priceUpserts, pushSent, pushFailed,
    regionPushSent, regionPushFailed,
    fetchErrors: fetchErrors.length ? fetchErrors : undefined,
  });
}
