// Cron (1일 1회) — 세차 지수(시도×일자) 산출·적재. (FR-2)
// Authorization: Bearer ${CRON_SECRET}
//
// 적재 대상(0037 마이그레이션):
//   carwash_index : 시도 17개 × 4일(오늘~D+3). 기상청 단기예보 POP + 에어코리아 미세먼지(결측 허용).
//
// graceful:
//   - CRON_SECRET 미설정/불일치면 401(SEC-2). 크론 라우트 보호 패턴(sync-market)과 동형.
//   - USE_MOCK / Supabase 미설정 / KMA_API_KEY 미설정이면 적재 없이 skip 응답(키 없이 로컬 동작).
//   - 시도별 부분 실패(POP 조회 실패 등)는 그 시도만 건너뛰고, 성공분만 upsert(5xx 아님).
//   - 미세먼지 API는 선택 입력 — 실패해도 강수확률 기반 지수는 정상 적재(dustGrade null).

import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import {
  SIDO_CODES, SIDO_GRID,
  fetchPopByDate, fetchDustGrades, buildDaysForSido,
} from '@/lib/weather/kma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  // CRON_SECRET 빈값 가드 — 미설정 시 무조건 거부(Authorization: Bearer undefined 우회 차단).
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (secret.length === 0 || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (
    process.env.NEXT_PUBLIC_USE_MOCK === 'true'
    || !isSupabaseConfigured()
    || !process.env.KMA_API_KEY
  ) {
    return NextResponse.json({
      skipped: true,
      reason: 'mock mode, supabase not configured, or KMA_API_KEY missing',
    });
  }

  const sb = getSupabase();
  const now = new Date();
  const nowIso = now.toISOString();
  const errors: string[] = [];

  // 미세먼지 예보는 전국 1콜(권역별 등급). 실패해도 빈 맵(감점 없음).
  const dustByRegion = await fetchDustGrades({ now });

  type Row = {
    date: string; region: string; score: number; grade: string;
    pop_max: number | null; pop_next: number | null; dust_grade: string | null;
    updated_at: string;
  };
  const rows: Row[] = [];

  // 시도별 단기예보 POP 조회(17콜). 시도 하나가 실패해도 나머지는 계속.
  for (const code of SIDO_CODES) {
    try {
      const { nx, ny } = SIDO_GRID[code];
      const popByDate = await fetchPopByDate({ nx, ny, now });
      const days = buildDaysForSido(code, popByDate, dustByRegion, now);
      for (const d of days) {
        rows.push({
          date: d.date, region: code, score: d.score, grade: d.grade,
          pop_max: d.popMax, pop_next: d.popNext, dust_grade: d.dustGrade,
          updated_at: nowIso,
        });
      }
    } catch (e) {
      errors.push(`sido-${code}: ${(e as Error).message}`);
    }
  }

  // ─── upsert (멱등) — (date, region) 충돌 시 갱신. 성공분만 적재. ───
  let upserts = 0;
  if (rows.length > 0) {
    const { error } = await sb.from('carwash_index').upsert(rows, { onConflict: 'date,region' });
    if (error) {
      return NextResponse.json(
        { error: `carwash_index upsert failed: ${error.message}`, errors: errors.length ? errors : undefined },
        { status: 500 },
      );
    }
    upserts = rows.length;
  }

  return NextResponse.json({
    ok: true,
    asOf: nowIso,
    sidoCount: SIDO_CODES.length,
    upserts,
    errors: errors.length ? errors : undefined,
  });
}
