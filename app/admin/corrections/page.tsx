// 사용자 제보(정정 요청) 검수 (/admin/corrections) — 운영자 전용.
//
// 보호: ADMIN_EMAILS 게이트 + noindex(리뷰 신고 관리 화면과 동형).
// 승인이 곧 반영이다 — 별도 '적용' 단계가 없다. 정비소 브랜드는 repair_brand_override 뷰가,
// 유가는 fuel_price_report_active 뷰가 status='approved' 를 그대로 읽기 때문이다.
// repair_shops.brand 를 직접 고치지 않는 이유는 sync-repair 가 반기마다 덮어쓰기 때문(0049 주석).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminOrNull } from '@/lib/auth/admin';
import { CorrectionsAdminClient } from './CorrectionsAdminClient';

export const metadata: Metadata = {
  title: '제보 검수 (운영)',
  robots: { index: false, follow: false },
};

// 매 요청 시 최신 DB 값으로(캐시 안 함).
export const dynamic = 'force-dynamic';

export default async function CorrectionsAdminPage() {
  if (!(await getAdminOrNull())) notFound();
  return <CorrectionsAdminClient />;
}
