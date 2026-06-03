// 전기차 충전소 상세 — 진입 시 그 충전소 1곳만 data.go.kr에서 라이브 갱신 후 DB값으로 응답(준실시간).
// 라이브 호출 실패/지연·최근 갱신(debounce) 시 DB 스냅샷으로 폴백한다. 표시는 항상 우리 DB.
import { NextResponse } from 'next/server';
import { refreshAndQueryEvStationDetail } from '@/lib/db/ev';

// 라이브 갱신을 수행하므로 캐시하지 않는다(과호출은 lib 내부 debounce로 방어).
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { statId: string } }) {
  const statId = String(params.statId ?? '').trim();
  if (!statId) return NextResponse.json({ error: 'invalid statId' }, { status: 400 });

  let detail = null;
  try {
    detail = await refreshAndQueryEvStationDetail(statId);
  } catch {
    detail = null;
  }
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(detail);
}
