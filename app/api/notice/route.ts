// 공개 — 현재 활성 공지 1건 조회. 첫 화면 공지 팝업(NoticePopup)이 마운트 시 호출한다.
// 활성 공지가 없으면 { notice: null }. 관리자가 바꾸면 곧바로 반영되도록 캐시하지 않는다
// (디바이스당 진입 시 1회 호출이라 트래픽 부담 적음).

import { NextResponse } from 'next/server';
import { getActiveNotice } from '@/lib/db/notices';
import type { ActiveNoticeResponse } from '@/types/notice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const notice = await getActiveNotice();
  const body: ActiveNoticeResponse = {
    notice: notice
      ? { id: notice.id, imageUrl: notice.imageUrl, linkUrl: notice.linkUrl }
      : null,
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
