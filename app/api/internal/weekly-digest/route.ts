// ③ 주간 최저가 다이제스트 — 주 1회(예: 월요일 아침) 실행.
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK/Supabase 미설정/VAPID 미설정 시 graceful skip.
//
// 대상: last_lat/last_lng 가 있고 "푸시 구독이 있는(프리미엄)" 회원.
//  - 푸시 구독 API가 isPremium 전용이므로 push_subscriptions 보유 = 사실상 프리미엄(SEC 구조 유지).
//  - 각자 last_lat/lng 반경(기본 5km)의 "이번 주 최저가 TOP3 + 간단 전망(추세)"을 만들어 웹푸시 발송.
//  - 푸시 클릭 시 최저가 주유소 상세로 이동.
//
// 안전: 사용자 루프는 청크 + 에러 격리(한 명 실패가 전체를 멈추지 않게). 우리 DB만 사용(외부 API 무관).
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getDefaultProduct } from '@/lib/auth/session';
import { sendPush } from '@/lib/push/webpush';
import { queryRegionTop10, queryPriceTrend } from '@/lib/db/queries';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 다이제스트 기준 — 유종은 사용자별 기본 차량 유종(미설정 시 휘발유 폴백), 반경 5km(내 지역 체감 범위).
const DIGEST_PRODUCT_FALLBACK: ProductCode = 'B027';
const DIGEST_RADIUS_M = 5000;
// 한 번에 처리할 사용자 청크(발송량 폭주 방지 — 청크 사이는 직렬).
const USER_CHUNK = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'mock mode or missing config' });
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ skipped: true, reason: 'VAPID not configured' });
  }

  const sb = getSupabase();
  const errors: string[] = [];

  // 1) 푸시 구독이 있는 사용자 → user_id별 구독 묶음
  const { data: subRows, error: subErr } = await sb
    .from('push_subscriptions')
    .select('user_id, id, endpoint, p256dh, auth');
  if (subErr) return NextResponse.json({ error: `push_subscriptions: ${subErr.message}` }, { status: 500 });

  const subsByUser = new Map<string, Array<{ id: number; endpoint: string; p256dh: string; auth: string }>>();
  for (const s of subRows ?? []) {
    const arr = subsByUser.get(s.user_id) ?? [];
    arr.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    subsByUser.set(s.user_id, arr);
  }
  if (subsByUser.size === 0) {
    return NextResponse.json({ ok: true, targets: 0, sent: 0, reason: 'no push subscribers' });
  }

  // 2) 그 사용자들 중 마지막 위치(last_lat/lng)가 있는 사람만 대상
  const userIds = [...subsByUser.keys()];
  // 탈퇴자 제외(deleted_at IS NULL): 행을 지우지 않으므로 탈퇴자 push_subscriptions가 남아 있어도
  // 발송하면 안 된다. 0028 미적용 환경(컬럼 부재 42703)은 아래 uErr graceful skip으로 흡수된다.
  const { data: users, error: uErr } = await sb
    .from('users')
    .select('id, last_lat, last_lng')
    .in('id', userIds)
    .is('deleted_at', null)
    .not('last_lat', 'is', null)
    .not('last_lng', 'is', null);
  if (uErr) {
    // 0024/0028 미적용(컬럼 없음 42703) 등 — graceful skip.
    return NextResponse.json({ skipped: true, reason: `users location not available: ${uErr.message}` });
  }

  const targets = (users ?? []) as Array<{ id: string; last_lat: number; last_lng: number }>;
  let sent = 0;
  let failed = 0;
  let skippedNoData = 0;
  let processed = 0;

  for (const batch of chunk(targets, USER_CHUNK)) {
    await Promise.all(batch.map(async (u) => {
      processed++;
      const subs = subsByUser.get(u.id);
      if (!subs || subs.length === 0) return;
      try {
        // 유종은 사용자별 기본 차량 유종 기준(미설정이면 휘발유 폴백) — 경유차엔 경유 최저가를 보낸다.
        const product = (await getDefaultProduct(u.id)) ?? DIGEST_PRODUCT_FALLBACK;
        const top = await queryRegionTop10(u.last_lat, u.last_lng, DIGEST_RADIUS_M, product);
        if (top.length === 0) { skippedNoData++; return; }

        const lowest = top[0];
        // 간단 전망 — 추세(우리 DB prices_history). 부족하면 문구 생략(graceful).
        let outlook = '';
        try {
          const trend = await queryPriceTrend(u.last_lat, u.last_lng, DIGEST_RADIUS_M, product);
          if (trend.trend === 'up') outlook = ' · 오름세 전망';
          else if (trend.trend === 'down') outlook = ' · 내림세 전망';
        } catch { /* 추세 실패는 무시 — 최저가만 발송 */ }

        const top3 = top.slice(0, 3).map((t) => `₩${t.price.toLocaleString()}`).join(' · ');
        const payload = {
          title: '📊 이번 주 내 지역 최저가',
          body: `${PRODUCT_LABEL[product]} TOP${Math.min(3, top.length)} ${top3}${outlook}`,
          url: `/station/${encodeURIComponent(lowest.stationId)}`,
          tag: 'weekly-digest',
        };

        for (const sub of subs) {
          const r = await sendPush(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            payload,
          );
          if (r.ok) sent++;
          else {
            failed++;
            if (r.gone) await sb.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      } catch (e) {
        // 한 사용자 실패가 전체를 멈추지 않게 격리.
        failed++;
        errors.push(`user ${u.id}: ${(e as Error).message}`);
      }
    }));
  }

  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    subscribers: subsByUser.size,
    targets: targets.length,
    processed,
    sent, failed, skippedNoData,
    // 유종은 사용자별 기본 차량 유종(미설정 시 휘발유 폴백)이라 단일 값이 아니다.
    product: 'per-user (fallback B027)', radiusM: DIGEST_RADIUS_M,
    errors: errors.length ? errors.slice(0, 20) : undefined,
  });
}
