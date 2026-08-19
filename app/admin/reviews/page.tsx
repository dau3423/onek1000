// 리뷰 신고 모더레이션 (/admin/reviews) — 운영자 전용.
//
// 보호: ADMIN_EMAILS 게이트 + noindex. 비관리자/비로그인은 notFound()로 가린다.
// 이 화면이 곧 모더레이션 시스템 그 자체다 — is_hidden 컬럼은 있었지만(0004) 여태 코드 전체에서
// 쓰는 곳이 없어, 부적절한 리뷰를 내리려면 운영자가 Supabase SQL 편집기에서 직접 UPDATE 해야
// 했다. 데이터는 클라이언트가 GET /api/admin/reviews/reports 로 직접 불러온다(공지 관리 화면과
// 달리 서버에서 미리 채워 넘길 필요가 없다 — 숨김/기각 후 같은 엔드포인트를 다시 불러 갱신한다).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminOrNull } from '@/lib/auth/admin';
import { ReviewsAdminClient } from './ReviewsAdminClient';

export const metadata: Metadata = {
  title: '리뷰 신고 관리 (운영)',
  robots: { index: false, follow: false },
};

// 매 요청 시 최신 DB 값으로(캐시 안 함).
export const dynamic = 'force-dynamic';

export default async function ReviewsAdminPage() {
  if (!(await getAdminOrNull())) notFound();

  return <ReviewsAdminClient />;
}
