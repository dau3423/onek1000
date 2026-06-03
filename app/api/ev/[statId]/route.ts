// 전기차 충전소 상세 API.
//  - GET  : 우리 DB값만 반환(외부 호출 없음 → 빠름). 진입/일반 조회용.
//  - POST : 명시적 "새로고침". 그 충전소 1곳만 data.go.kr에서 라이브 갱신 → ev_chargers upsert →
//           갱신된 DB값으로 응답(준실시간). 상세 화면의 새로고침 버튼이 호출한다.
// 표시는 항상 우리 DB. 라이브 호출 실패/지연·최근 갱신(debounce) 시 DB 스냅샷으로 폴백한다.
import { NextResponse } from 'next/server';
import { queryEvStationDetail, refreshAndQueryEvStationDetail } from '@/lib/db/ev';

// 충전기 상태는 자주 바뀌므로 캐시하지 않는다(과호출은 lib 내부 debounce로 방어).
export const dynamic = 'force-dynamic';

/** DB만으로 즉시 조회(외부 호출 없음). */
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

/** 명시적 새로고침: 라이브 갱신(서버 전용 외부 호출) 후 갱신된 DB값으로 응답. */
export async function POST(_req: Request, { params }: { params: { statId: string } }) {
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
