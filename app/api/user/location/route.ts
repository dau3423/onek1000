// 사용자 마지막 위치 저장 — 로그인 필요, 본인 스코프, best-effort.
// 서버 cron(③ 주간 다이제스트)이 "사용자의 내 지역"을 알 수 있도록 좌표만 가볍게 저장한다.
// 클라이언트가 throttle(좌표 변화/하루 1회)해서 호출하므로 여기선 단순 UPDATE만 한다.
// 0024 미적용 환경에서도 깨지지 않게 컬럼 없음(42703)은 무해 처리한다.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { lat?: number; lng?: number };
  try {
    body = (await req.json()) as { lat?: number; lng?: number };
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'invalid coords' }, { status: 400 });
  }

  // Mock/미설정: 저장 없이 성공 처리(흐름 유지, best-effort).
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, saved: false });

  const sb = getSupabase();
  const { data: user } = await sb.from('users').select('id').eq('email', session.user.email).maybeSingle();
  if (!user?.id) return NextResponse.json({ ok: true, saved: false });

  const { error } = await sb
    .from('users')
    .update({ last_lat: lat, last_lng: lng, last_loc_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) {
    // 0024 미적용(컬럼 없음)·기타 오류 — best-effort라 200으로 흡수(클라이언트 무시).
    return NextResponse.json({ ok: true, saved: false, reason: error.code ?? 'error' });
  }
  return NextResponse.json({ ok: true, saved: true });
}
