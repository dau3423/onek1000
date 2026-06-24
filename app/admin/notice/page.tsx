// 공지 팝업 관리 (/admin/notice) — 운영자 전용.
//
// 보호: ADMIN_EMAILS 게이트 + noindex. 비관리자/비로그인은 notFound()로 가린다.
// 기능: 공지 이미지 업로드 + 링크 URL 설정 → 첫 화면 공지 팝업으로 노출(단일 활성 공지).
//   현재 활성 공지를 미리 불러와 클라이언트에 넘긴다.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminOrNull } from '@/lib/auth/admin';
import { getLatestNotice } from '@/lib/db/notices';
import { NoticeAdminClient } from './NoticeAdminClient';

export const metadata: Metadata = {
  title: '공지 팝업 관리 (운영)',
  robots: { index: false, follow: false },
};

// 매 요청 시 최신 DB 값으로(캐시 안 함).
export const dynamic = 'force-dynamic';

export default async function NoticeAdminPage() {
  if (!(await getAdminOrNull())) notFound();

  const latest = await getLatestNotice();
  const current = latest
    ? { id: latest.id, imageUrl: latest.imageUrl, linkUrl: latest.linkUrl, isActive: latest.isActive }
    : null;

  return <NoticeAdminClient current={current} />;
}
