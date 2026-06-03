// 내 주유 기록 개별 편집/삭제 — 로그인 필요, 본인 것만.
// PATCH: 금액/주유량(L)/주행거리/메모 편집(모두 선택, null 허용).
// DELETE: 기록 삭제.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import type { FuelLog } from '@/types/fuel-log';

export const runtime = 'nodejs';

interface Params { params: { id: string } }

async function getUserId(email: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  return data?.id ?? null;
}

const SELECT_COLS =
  'id, kind, station_id, station_name, product, unit_price, amount_won, liters, kwh, odometer, memo, logged_at, created_at';

interface FuelLogRow {
  id: string;
  kind: string | null;
  station_id: string;
  station_name: string;
  product: string;
  unit_price: number | null;
  amount_won: number | null;
  liters: number | string | null;
  kwh: number | string | null;
  odometer: number | null;
  memo: string | null;
  logged_at: string;
  created_at: string;
}

function toFuelLog(r: FuelLogRow): FuelLog {
  return {
    id: r.id,
    kind: r.kind === 'ev' ? 'ev' : 'gas',
    stationId: r.station_id,
    stationName: r.station_name,
    product: (r.product as ProductCode) in PRODUCT_LABEL ? (r.product as ProductCode) : 'B027',
    unitPrice: r.unit_price,
    amountWon: r.amount_won,
    liters: r.liters === null ? null : Number(r.liters),
    kwh: r.kwh === null ? null : Number(r.kwh),
    odometer: r.odometer,
    memo: r.memo,
    loggedAt: r.logged_at,
    createdAt: r.created_at,
  };
}

/** 정수 입력(원/km) 정규화: 빈값/null → null, 음수/NaN → 오류 사유 반환 */
function parseIntField(v: unknown): number | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return Math.round(n);
}

/** 주유량(L)/충전량(kWh) 정규화: 소수 둘째자리까지 허용 */
function parseDecimalField(v: unknown): number | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return Math.round(n * 100) / 100;
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const body = (await req.json()) as {
    amountWon?: unknown; liters?: unknown; kwh?: unknown; odometer?: unknown; memo?: unknown;
  };

  const patch: Record<string, number | string | null> = {};

  if ('amountWon' in body) {
    const v = parseIntField(body.amountWon);
    if (v === 'invalid') return NextResponse.json({ error: '금액은 0 이상 숫자여야 해요.' }, { status: 400 });
    patch.amount_won = v;
  }
  if ('liters' in body) {
    const v = parseDecimalField(body.liters);
    if (v === 'invalid') return NextResponse.json({ error: '주유량은 0 이상 숫자여야 해요.' }, { status: 400 });
    patch.liters = v;
  }
  if ('kwh' in body) {
    const v = parseDecimalField(body.kwh);
    if (v === 'invalid') return NextResponse.json({ error: '충전량은 0 이상 숫자여야 해요.' }, { status: 400 });
    patch.kwh = v;
  }
  if ('odometer' in body) {
    const v = parseIntField(body.odometer);
    if (v === 'invalid') return NextResponse.json({ error: '주행거리는 0 이상 숫자여야 해요.' }, { status: 400 });
    patch.odometer = v;
  }
  if ('memo' in body) {
    const memo = body.memo;
    if (memo === null || memo === '') patch.memo = null;
    else if (typeof memo === 'string') {
      if (memo.length > 200) return NextResponse.json({ error: '메모는 200자 이내로 입력해 주세요.' }, { status: 400 });
      patch.memo = memo.trim();
    } else {
      return NextResponse.json({ error: 'memo invalid' }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '수정할 항목이 없어요.' }, { status: 400 });
  }

  const sb = getSupabase();
  // 소유자 스코프 검증 + 갱신을 한 번에(eq user_id로 본인 것만)
  const { data, error } = await sb
    .from('fuel_logs')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', userId)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: '수정에 실패했어요.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ log: toFuelLog(data as FuelLogRow) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const sb = getSupabase();
  await sb.from('fuel_logs').delete().eq('id', params.id).eq('user_id', userId);
  return NextResponse.json({ ok: true });
}
