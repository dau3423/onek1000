// 세차 지수 알림 발송 — 1일 1회(sync-weather 이후 아침) 실행.
// Authorization: Bearer ${CRON_SECRET}. USE_MOCK/Supabase 미설정/VAPID 미설정 시 graceful skip.
//
// 대상: carwash_notify_opt_in=true 이고 "푸시 구독이 있는" 회원.
//  - 오늘자(KST) carwash_index 가 grade='good' + 점수 임계 이상인 시도의 사용자에게만 발송.
//  - dedupe: carwash_notify_log 로 같은 날 중복·맑은 날 연속 구간 반복 발송을 막는다(순수함수 위임).
//
// ⚠️ 지역 판정: 세차 지수는 시도 단위인데 사용자 위치를 직접 저장하지 않는다.
//    1순위 관심지역(interest_regions.lat/lng → nearestSido) — 사용자가 직접 찍은 좌표라 정확하다.
//    2순위 최근 방문 시도(page_visits.sido_code) — GeoLite2 IP 기반이라 부정확할 수 있다
//          (모바일 통신사는 서울로 잡히는 경우가 흔하다).
//    둘 다 없으면 **보내지 않는다**. 위치를 모르는 채 서울로 추측해 보내면 틀린 알림이 된다.
//    부정확 가능성 때문에 알림 본문에 판정 지역명을 반드시 넣는다(lib/carwash/notify.ts).
//
// 안전: 사용자 루프는 청크 + 에러 격리(한 명 실패가 전체를 멈추지 않게). 우리 DB만 사용(외부 API 무관).
//   sync-weather(carwash_index 적재) 이후에 스케줄해야 오늘자 지수를 반영한다.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { sendPush } from '@/lib/push/webpush';
import { nearestSido } from '@/lib/weather/kma';
import {
  decideCarwashNotify,
  buildCarwashNotifyPayload,
  type CarwashSnapshot,
  type CarwashLastSent,
  type CarwashGrade,
} from '@/lib/carwash/notify';
import { SIDO_NAME, type SidoCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 한 번에 처리할 사용자 청크(발송량 폭주 방지 — 청크 사이는 직렬). */
const USER_CHUNK = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 오늘(KST) YYYY-MM-DD. carwash_index.date 가 KST 기준이라 맞춰야 한다. */
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  // CRON_SECRET 빈값 가드 — 미설정 시 무조건 거부(Authorization: Bearer undefined 우회 차단).
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (secret.length === 0 || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'mock mode or missing config' });
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ skipped: true, reason: 'VAPID not configured' });
  }

  const sb = getSupabase();
  const nowIso = new Date().toISOString();
  const today = kstToday();
  const errors: string[] = [];

  // 0) 오늘자 시도별 지수 스냅샷. 시도는 17개뿐이라 한 번에 읽는다.
  const { data: idxRows, error: idxErr } = await sb
    .from('carwash_index')
    .select('region, date, grade, score')
    .eq('date', today);
  if (idxErr) {
    // 0037 미적용(테이블 없음) 등 — graceful skip.
    return NextResponse.json({ skipped: true, reason: `carwash_index not available: ${idxErr.message}` });
  }
  const byRegion = new Map<string, CarwashSnapshot>();
  for (const r of idxRows ?? []) {
    byRegion.set(String(r.region), {
      region: String(r.region),
      date: String(r.date),
      grade: String(r.grade) as CarwashGrade,
      score: Number(r.score ?? 0),
    });
  }
  // 좋은 시도가 하나도 없으면 조기 종료(불필요한 사용자 스캔 회피).
  if (![...byRegion.values()].some((s) => s.grade === 'good')) {
    return NextResponse.json({ ok: true, sent: 0, date: today, reason: 'no good-grade region today' });
  }

  // 1) 옵트인 사용자. 탈퇴자 제외(deleted_at IS NULL) — 행을 지우지 않으므로 명시적으로 걸러야 한다.
  const { data: optInUsers, error: optErr } = await sb
    .from('users')
    .select('id')
    .eq('carwash_notify_opt_in', true)
    .is('deleted_at', null);
  if (optErr) {
    // 0053 미적용(컬럼 없음 42703) 등 — graceful skip.
    return NextResponse.json({ skipped: true, reason: `opt-in not available: ${optErr.message}` });
  }
  const optInIds = (optInUsers ?? []).map((u) => (u as { id: string }).id);
  if (optInIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, date: today, reason: 'no opt-in users' });
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
    return NextResponse.json({ ok: true, sent: 0, date: today, reason: 'no push subscribers among opt-in users' });
  }
  const targetIds = [...subsByUser.keys()];

  // 3) 지역 판정 재료를 한 번에 모은다(사용자당 왕복을 만들지 않는다).
  const regionByUser = new Map<string, string>();
  const { data: irRows } = await sb
    .from('interest_regions')
    .select('user_id, lat, lng')
    .in('user_id', targetIds);
  for (const r of irRows ?? []) {
    const uid = String(r.user_id);
    if (regionByUser.has(uid)) continue;   // 관심지역이 여러 개면 첫 번째를 쓴다
    const lat = Number(r.lat), lng = Number(r.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) regionByUser.set(uid, nearestSido(lat, lng));
  }
  // 관심지역이 없는 사용자만 방문 이력으로 폴백한다(부정확할 수 있어 2순위).
  const needFallback = targetIds.filter((id) => !regionByUser.has(id));
  if (needFallback.length > 0) {
    const { data: pvRows } = await sb
      .from('page_visits')
      .select('user_id, sido_code, visit_date')
      .in('user_id', needFallback)
      .not('sido_code', 'is', null)
      .order('visit_date', { ascending: false });
    for (const r of pvRows ?? []) {
      const uid = String(r.user_id);
      if (regionByUser.has(uid)) continue;  // 정렬상 첫 행이 최근 방문
      regionByUser.set(uid, String(r.sido_code));
    }
  }

  let sent = 0, failed = 0, skippedDecision = 0, noRegion = 0, processed = 0;

  for (const batch of chunk(targetIds, USER_CHUNK)) {
    await Promise.all(batch.map(async (userId) => {
      processed++;
      const subs = subsByUser.get(userId);
      if (!subs || subs.length === 0) return;
      try {
        const region = regionByUser.get(userId);
        // 위치를 모르면 보내지 않는다 — 서울로 추측해 보내면 틀린 알림이 된다.
        if (!region) { noRegion++; return; }
        const snap = byRegion.get(region);
        if (!snap) { skippedDecision++; return; }

        // 직전 발송 이력(dedupe 판정용) — 사용자별 최신 1건.
        const { data: lastRow } = await sb
          .from('carwash_notify_log')
          .select('date, sent_at')
          .eq('user_id', userId)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const last: CarwashLastSent | null = lastRow
          ? { date: String(lastRow.date), sentAt: String(lastRow.sent_at) }
          : null;

        const decision = decideCarwashNotify(snap, last, { now: nowIso });
        if (!decision.send) { skippedDecision++; return; }

        const regionName = SIDO_NAME[region as SidoCode] ?? region;
        const payload = buildCarwashNotifyPayload(regionName, snap.score);

        let anySent = false;
        for (const sub of subs) {
          const r = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
          if (r.ok) { sent++; anySent = true; }
          else {
            failed++;
            if (r.gone) await sb.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }

        // 발송 이력 기록(dedupe 기준). 최소 1개 기기에 성공했을 때만 남긴다.
        if (anySent) {
          await sb.from('carwash_notify_log').insert({
            user_id: userId,
            region: snap.region,
            date: snap.date,
            grade: snap.grade,
            score: snap.score,
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
    date: today,
    goodRegions: [...byRegion.values()].filter((s) => s.grade === 'good').map((s) => s.region),
    optInUsers: optInIds.length,
    subscribers: subsByUser.size,
    processed,
    sent, failed, skippedDecision, noRegion,
    errors: errors.length ? errors.slice(0, 20) : undefined,
  });
}
