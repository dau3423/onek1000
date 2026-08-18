// 주유소 리뷰 — 공통 핸들러(lib/api/place-reviews.ts)를 gas 로 호출하는 얇은 껍데기.
//
// 지우지 않는 이유는 배포 순서다. 새 코드가 배포된 직후에도 브라우저에 떠 있는 구버전 페이지가
// 이 경로로 GET/POST 를 보낸다. 남겨두면 그 창에서 리뷰 조회·작성이 실패하지 않는다.
// 소비자가 모두 새 경로로 옮겨간 뒤 제거한다.
import { listPlaceReviews, createPlaceReview } from '@/lib/api/place-reviews';

export const runtime = 'nodejs';
export const revalidate = 30;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return listPlaceReviews(req, 'gas', params.id);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return createPlaceReview(req, 'gas', params.id);
}
