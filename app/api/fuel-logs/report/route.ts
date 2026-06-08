// 차계부 / 주유비 리포트 — 로그인 필요, 소유자 스코프(본인 기록만).
// 우리 DB(fuel_logs + prices_latest)만 집계한다(외부 API 호출 없음). 모든 회원 무료(프리미엄 게이트 없음).
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { queryMyFuelLogs, queryNationalAvgPrices } from '@/lib/db/queries';
import { buildReport } from '@/lib/fuel/report';
import type { FuelReport } from '@/types/fuel-report';

export const runtime = 'nodejs';

/** 빈 리포트(기록 없음/DB 미설정) — 빈 상태 UI가 깨지지 않게 구조는 유지. */
function emptyReport(months: number): FuelReport {
  return {
    summary: { months, totalSpent: 0, totalLiters: 0, avgUnitPrice: null, count: 0, thisMonthSpent: 0 },
    monthly: [],
    economy: { avgKmPerL: null, segments: 0, reason: 'no-odometer' },
    savings: { estimatedWon: null, baseline: {}, usedCount: 0 },
    ev: { count: 0, totalSpent: 0, totalKwh: 0 },
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // months: 6~12개월(기본 12). 그 외 값은 12로 보정.
  const sp = new URL(req.url).searchParams;
  const m = Number(sp.get('months') ?? '12');
  const months = Number.isFinite(m) && m >= 1 && m <= 24 ? Math.floor(m) : 12;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ report: emptyReport(months) });
  }

  // 기간 시작(해당 월 1일 0시)부터의 기록만 조회.
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).toISOString();

  const [logs, baseline] = await Promise.all([
    queryMyFuelLogs(session.user.email, since),
    queryNationalAvgPrices(),
  ]);

  const report = buildReport(logs, baseline, months, now);
  return NextResponse.json({ report });
}
