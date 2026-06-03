// 전기차 충전소 상세 — 우리 DB(ev_chargers)만 조회. data.go.kr는 sync에서만 호출.
import { NextResponse } from 'next/server';
import { queryEvStationDetail } from '@/lib/db/ev';

export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: { statId: string } }) {
  const statId = String(params.statId ?? '').trim();
  if (!statId) return NextResponse.json({ error: 'invalid statId' }, { status: 400 });

  let detail = null;
  try {
    detail = await queryEvStationDetail(statId);
  } catch {
    detail = null;
  }
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(detail);
}
