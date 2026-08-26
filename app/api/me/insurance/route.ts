// 내 자동차보험사 저장·조회 — 긴급 화면에서 원터치 전화를 위해.
//
//  GET   → { insurer: InsurerId | null }
//  PUT   { insurer: InsurerId | null }  → 저장(null 이면 해제)
//
// 저장하는 건 **어느 회사인지 뿐**이다. 증권번호·가입일 같은 계약 정보는 받지도 저장하지도
// 않는다 — 긴급 전화에 필요 없고, 민감정보를 늘리면 유출 시 피해만 커진다(0052 주석).
//
// 0052 미적용 환경에서도 긴급 화면이 막히면 안 되므로, 컬럼이 없으면 조용히 null/실패로 넘긴다.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { isInsurerId } from '@/lib/insurance/companies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 컬럼 부재(0052 미적용)를 나타내는 PostgREST 코드. */
function isMissingColumn(code?: string): boolean {
  return code === '42703' || code === 'PGRST204';
}

async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (session?.revoked || !session?.user?.email) return null;
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('id').eq('email', session.user.email).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ insurer: null });
  const sb = getSupabase();
  const { data, error } = await sb
    .from('users').select('insurance_company').eq('id', userId).maybeSingle();
  if (error) {
    // 0052 미적용이면 '미설정'과 같게 취급한다 — 화면은 전체 목록으로 정상 동작한다.
    if (!isMissingColumn(error.code)) console.warn('insurance get fail:', error.message);
    return NextResponse.json({ insurer: null });
  }
  return NextResponse.json({ insurer: (data?.insurance_company as string | null) ?? null });
}

export async function PUT(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { insurer?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'json body expected' }, { status: 400 });
  }

  // null = 해제. 그 외에는 우리가 아는 보험사만 받는다(주소창으로 아무 값이나 들어올 수 있다).
  const value = body.insurer === null ? null : isInsurerId(body.insurer) ? body.insurer : undefined;
  if (value === undefined) {
    return NextResponse.json({ error: 'invalid insurer' }, { status: 400 });
  }

  const sb = getSupabase();
  const { error } = await sb.from('users').update({ insurance_company: value }).eq('id', userId);
  if (error) {
    if (isMissingColumn(error.code)) {
      return NextResponse.json({ error: 'not available', code: 'unavailable' }, { status: 503 });
    }
    console.warn('insurance put fail:', error.message);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, insurer: value });
}
