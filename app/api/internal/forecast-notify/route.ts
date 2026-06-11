// 주유 타이밍(가격 인상) 예측 알림 발송 — 1일 1회(run-forecast 이후) 실행.
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK/Supabase 미설정/VAPID 미설정 시 graceful skip.
//
// 대상: forecast_notify_opt_in=true 이고 "푸시 구독이 있는" 회원.
//  - 오늘자(=최신 forecast_date) 최신 예측이 direction='up' + 신뢰도 임계치 이상인 유종만 발송.
//  - 유종은 사용자 기본 차량 유종(미설정이면 휘발유 B027 폴백) 기준 — weekly-digest 와 동일 패턴.
//  - dedupe: forecast_notify_log 의 직전 발송으로 "같은 상승 국면 반복 발송"을 막는다(순수함수 위임).
//  - 푸시 클릭 시 메인(예측 카드)으로 딥링크(/?forecast=1).
//
// ⚠️ 모델은 horizon(14일) 방향성이라 '내일 인상' 같은 단정/익일 카피는 쓰지 않는다(lib/forecast/notify.ts).
// 안전: 사용자 루프는 청크 + 에러 격리(한 명 실패가 전체를 멈추지 않게). 우리 DB만 사용(외부 API 무관).
//   run-forecast(price_forecast 생성) 이후에 스케줄해야 오늘자 예측을 반영한다.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getDefaultProduct } from '@/lib/auth/session';
import { sendPush } from '@/lib/push/webpush';
import { FORECAST_CONFIG } from '@/lib/forecast/config';
import type { Direction } from '@/lib/forecast/model';
import {
  decideForecastNotify,
  buildForecastNotifyPayload,
  type ForecastSnapshot,
  type LastSent,
} from '@/lib/forecast/notify';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 발송 기준 유종 — 사용자 차량 유종(미설정 시 휘발유 폴백). 예측 대상 유종(B027/D047)만 의미 있음.
const NOTIFY_PRODUCT_FALLBACK: ProductCode = 'B027';
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
  const cfg = FORECAST_CONFIG;
  const nowIso = new Date().toISOString();
  const errors: string[] = [];

  // 0) 유종별 "오늘자(최신) 상승 예측" 스냅샷 로드.
  //    region='nation', 현재 model_version. 유종별 가장 최근 forecast_date 1건만 필요.
  //    예측 대상 유종(B027/D047)은 소수라, 유종별로 최신 1건씩 직접 조회한다.
  const latestByFuel = new Map<string, ForecastSnapshot>();
  for (const fuel of ['B027', 'D047'] as const) {
    const { data, error } = await sb
      .from('price_forecast')
      .select('fuel_type, forecast_date, direction, confidence')
      .eq('region', 'nation')
      .eq('fuel_type', fuel)
      .eq('model_version', cfg.version)
      .order('forecast_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      // 42P01(테이블 없음) 등 — 예측 인프라 미적용 환경: graceful skip.
      return NextResponse.json({ skipped: true, reason: `price_forecast not available: ${error.message}` });
    }
    if (data) {
      latestByFuel.set(fuel, {
        fuelType: data.fuel_type as string,
        forecastDate: data.forecast_date as string,
        direction: data.direction as Direction,
        confidence: Number(data.confidence ?? 0),
      });
    }
  }
  // 상승 국면이 하나도 없으면 조기 종료(불필요한 사용자 스캔 회피).
  const hasUp = [...latestByFuel.values()].some((f) => f.direction === 'up');
  if (!hasUp) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'no up-forecast today' });
  }

  // 1) 옵트인 사용자(forecast_notify_opt_in=true) 조회.
  const { data: optInUsers, error: optErr } = await sb
    .from('users')
    .select('id')
    .eq('forecast_notify_opt_in', true);
  if (optErr) {
    // 0027 미적용(컬럼 없음 42703) 등 — graceful skip.
    return NextResponse.json({ skipped: true, reason: `opt-in not available: ${optErr.message}` });
  }
  const optInIds = (optInUsers ?? []).map((u) => (u as { id: string }).id);
  if (optInIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'no opt-in users' });
  }

  // 2) 그 사용자들의 푸시 구독 묶음.
  const { data: subRows, error: subErr } = await sb
    .from('push_subscriptions')
    .select('user_id, id, endpoint, p256dh, auth')
    .in('user_id', optInIds);
  if (subErr) return NextResponse.json({ error: `push_subscriptions: ${subErr.message}` }, { status: 500 });

  const subsByUser = new Map<string, Array<{ id: number; endpoint: string; p256dh: string; auth: string }>>();
  for (const s of subRows ?? []) {
    const arr = subsByUser.get(s.user_id) ?? [];
    arr.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    subsByUser.set(s.user_id, arr);
  }
  if (subsByUser.size === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'no push subscribers among opt-in users' });
  }

  const targetIds = [...subsByUser.keys()];
  let sent = 0;
  let failed = 0;
  let skippedDecision = 0;
  let processed = 0;

  for (const batch of chunk(targetIds, USER_CHUNK)) {
    await Promise.all(batch.map(async (userId) => {
      processed++;
      const subs = subsByUser.get(userId);
      if (!subs || subs.length === 0) return;
      try {
        // 유종 결정: 사용자 기본 차량 유종(미설정이면 휘발유 폴백). 예측 비대상 유종이면 휘발유로.
        let product = (await getDefaultProduct(userId)) ?? NOTIFY_PRODUCT_FALLBACK;
        if (!latestByFuel.has(product)) product = NOTIFY_PRODUCT_FALLBACK;

        const snap = latestByFuel.get(product);
        if (!snap) { skippedDecision++; return; }

        // 직전 발송 이력(dedupe 판정용) — 사용자별 최신 1건.
        const { data: lastRow } = await sb
          .from('forecast_notify_log')
          .select('forecast_date, sent_at')
          .eq('user_id', userId)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const last: LastSent | null = lastRow
          ? { forecastDate: lastRow.forecast_date as string, sentAt: lastRow.sent_at as string }
          : null;

        const decision = decideForecastNotify(snap, last, { now: nowIso });
        if (!decision.send) { skippedDecision++; return; }

        const payload = buildForecastNotifyPayload(PRODUCT_LABEL[product], cfg.horizon);

        let anySent = false;
        for (const sub of subs) {
          const r = await sendPush(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            payload,
          );
          if (r.ok) { sent++; anySent = true; }
          else {
            failed++;
            if (r.gone) await sb.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }

        // 발송 이력 기록(dedupe 기준). 최소 1개 기기에 성공했을 때만 남긴다.
        if (anySent) {
          await sb.from('forecast_notify_log').insert({
            user_id: userId,
            fuel_type: snap.fuelType,
            forecast_date: snap.forecastDate,
            direction: snap.direction,
            confidence: snap.confidence,
            sent_at: nowIso,
          });
        }
      } catch (e) {
        failed++;
        errors.push(`user ${userId}: ${(e as Error).message}`);
      }
    }));
  }

  return NextResponse.json({
    ok: true,
    asOf: nowIso,
    modelVersion: cfg.version,
    upFuels: [...latestByFuel.entries()].filter(([, f]) => f.direction === 'up').map(([k]) => k),
    optInUsers: optInIds.length,
    subscribers: subsByUser.size,
    processed,
    sent, failed, skippedDecision,
    errors: errors.length ? errors.slice(0, 20) : undefined,
  });
}
