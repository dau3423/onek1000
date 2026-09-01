// 세차 지수 조회 — 공개(rate limit, SEC-3 준용). (FR-2)
//   GET /api/carwash-index?lat=&lng=
//   응답: { region, regionName, days: [{date, score, grade, popMax, popNext, dustGrade}], best }
//
// 지역 판정: lat/lng → 17개 시도 대표점 중 최근접 시도(근사, 카드에 "○○ 기준" 라벨로 보완).
// 데이터 원천:
//   - Mock 모드/키 미설정/Supabase 미설정 → 고정 mock 지수(토요일류 good) 반환(키 없이 렌더).
//   - 그 외 → carwash_index(오늘~D+3) 조회. 오늘자 미존재면 days: [].

import { NextResponse, type NextRequest } from 'next/server';
import { clientIp } from '@/lib/http/clientIp';
import { hitRateLimit } from '@/lib/db/rateLimit';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import {
  nearestSido, windowDates, pickBest, gradeOf,
  mockCarwashIndex, type CarwashDay, type CarwashGrade, type CarwashIndexResult,
} from '@/lib/weather/kma';
import { SIDO_NAME, type SidoCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_WINDOW_SEC = 60;
const RATE_LIMIT = 60;

// 좌표 결측/비정상 시 서울 폴백(카드는 "서울 기준" 라벨로 근사 고지).
const FALLBACK: { lat: number; lng: number } = { lat: 37.5665, lng: 126.9780 };


export async function GET(req: NextRequest) {
  // rate limit(DB 백엔드 0056, 실패 시 0 → 통과). 초과 시 429.
  const count = await hitRateLimit(`carwash:${clientIp(req)}`, RATE_WINDOW_SEC);
  if (count > RATE_LIMIT) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const url = new URL(req.url);
  const latRaw = Number(url.searchParams.get('lat'));
  const lngRaw = Number(url.searchParams.get('lng'));
  const lat = Number.isFinite(latRaw) ? latRaw : FALLBACK.lat;
  const lng = Number.isFinite(lngRaw) ? lngRaw : FALLBACK.lng;
  const region = nearestSido(lat, lng);

  // Mock/키 미설정/Supabase 미설정 → mock 지수.
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured() || !process.env.KMA_API_KEY) {
    return NextResponse.json(mockCarwashIndex(region), {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' },
    });
  }

  // 실 데이터 조회 — 오늘~D+3 4일치. 테이블 부재/쿼리 오류면 graceful(days: []).
  const empty: CarwashIndexResult = { region, regionName: SIDO_NAME[region], days: [], best: null };
  try {
    const dates = windowDates();
    const sb = getSupabase();
    const { data, error } = await sb
      .from('carwash_index')
      .select('date, region, score, grade, pop_max, pop_next, dust_grade')
      .eq('region', region)
      .gte('date', dates[0])
      .lte('date', dates[dates.length - 1])
      .order('date', { ascending: true });
    if (error || !data) return NextResponse.json(empty);

    type Row = {
      date: string; score: number; grade: string;
      pop_max: number | null; pop_next: number | null; dust_grade: string | null;
    };
    const days: CarwashDay[] = (data as Row[]).map((r) => ({
      date: r.date,
      score: r.score,
      grade: (['good', 'fair', 'bad'].includes(r.grade) ? r.grade : gradeOf(r.score)) as CarwashGrade,
      popMax: r.pop_max,
      popNext: r.pop_next,
      dustGrade: r.dust_grade,
    }));

    const result: CarwashIndexResult = {
      region, regionName: SIDO_NAME[region as SidoCode], days, best: pickBest(days),
    };
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' },
    });
  } catch {
    return NextResponse.json(empty);
  }
}
