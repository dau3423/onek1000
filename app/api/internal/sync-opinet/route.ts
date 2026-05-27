// Vercel Cron (매시간) — 시도별 TOP20 + 시도별 평균가 동기화
// Authorization: Bearer ${CRON_SECRET}
// USE_MOCK=true 거나 Supabase 미설정인 경우 skip.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { redis, keys } from '@/lib/cache/redis';
import { sendPush } from '@/lib/push/webpush';
import { PRODUCT_LABEL, type SidoCode, type ProductCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  let stationUpserts = 0;
  let priceUpserts = 0;

  // 1) 시도별 평균가 → Redis
  for (const prod of PRODUCTS) {
    const list = await opinetAvgSido(prod);
    await redis.setJson(keys.avgSido(prod), list, 3600);
  }

  // 2) 시도별 TOP20 → stations + prices_latest UPSERT
  for (const sido of SIDOS) {
    for (const prod of PRODUCTS) {
      const list = await opinetLowTop10(sido, prod);
      for (const o of list) {
        const id = o.UNI_ID as string;
        if (!id) continue;

        // PostGIS geometry는 클라이언트에서 ST_MakePoint를 직접 표현하기 까다로워 RPC 호출.
        // 여기선 단순화: stations upsert는 raw SQL이 더 깔끔하지만 supabase-js 호환을 위해 별도 RPC를 두는 게 좋음.
        await sb.from('stations').upsert({
          id,
          brand_code: o.POLL_DVS_CD ?? 'ETC',
          brand_name: o.POLL_DVS_NM ?? '자영/기타',
          name: o.OS_NM,
          sido_code: sido,
          address: o.NEW_ADR ?? o.VAN_ADR ?? null,
          lat: o.GIS_Y_COORD,
          lng: o.GIS_X_COORD,
          // PostGIS WKT 입력 (Supabase는 geography에 WKT 자동 캐스팅 지원)
          geom: `SRID=4326;POINT(${o.GIS_X_COORD} ${o.GIS_Y_COORD})`,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        stationUpserts++;

        await sb.from('prices_latest').upsert({
          station_id: id,
          product: prod,
          price: o.PRICE,
          trade_dt: o.TRADE_DT ?? today,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'station_id,product' });

        await sb.from('prices_history').insert({
          station_id: id, product: prod, price: o.PRICE,
        });
        priceUpserts++;
      }
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

  return NextResponse.json({
    ok: true, asOf: new Date().toISOString(),
    sidos: SIDOS.length, products: PRODUCTS.length,
    stationUpserts, priceUpserts, pushSent, pushFailed,
  });
}
