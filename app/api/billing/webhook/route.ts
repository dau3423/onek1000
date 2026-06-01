// KG이니시스 가상계좌 입금통보/결제 통보(noti) 수신 — 보조용.
// 표준결제 승인은 /api/billing/confirm 의 S2S 승인요청에서 즉시 확정하므로,
// 여기서는 결과 로깅 및 (운영 시) 상태 보정에 활용한다.
// KG이니시스 noti는 application/x-www-form-urlencoded(NVP)로 전송된다.

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true }); // dev 환경

  // form-urlencoded 우선, JSON 폴백
  let body: Record<string, unknown> = {};
  const ct = req.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/json')) {
      body = (await req.json()) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      body = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
    }
  } catch {
    body = {};
  }

  const sb = getSupabase();
  await sb.from('billing_events').insert({
    kind: 'webhook',
    provider: 'inicis',
    amount: body?.price != null ? Number(body.price) : null,
    tid: (body?.tid as string) ?? null,
    oid: (body?.oid as string) ?? (body?.MOID as string) ?? null,
    raw: body,
  });

  // KG이니시스는 정상 수신 시 "OK" 텍스트 응답을 기대한다.
  return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
