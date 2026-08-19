// 장소(주유소/EV충전소/세차장) 공통 리뷰 목록 + 작성.
// 종류 검증 후 실제 처리는 lib/api/place-reviews.ts 의 공통 핸들러로 위임한다.
import { NextResponse } from 'next/server';
import { isPlaceType } from '@/types/review';
import { listPlaceReviews, createPlaceReview } from '@/lib/api/place-reviews';

export const runtime = 'nodejs';
export const revalidate = 30;

export async function GET(req: Request, { params }: { params: { type: string; id: string } }) {
  if (!isPlaceType(params.type)) {
    return NextResponse.json({ error: 'invalid place type' }, { status: 400 });
  }
  return listPlaceReviews(req, params.type, params.id);
}

export async function POST(req: Request, { params }: { params: { type: string; id: string } }) {
  if (!isPlaceType(params.type)) {
    return NextResponse.json({ error: 'invalid place type' }, { status: 400 });
  }
  return createPlaceReview(req, params.type, params.id);
}
