// 매일 SNS 게시용 — 전국 최저가 TOP10 복붙 도우미 (운영자 전용)
//
// 목적: 운영자가 하루 1번 열어, 오늘자 전국 최저가 휘발유(B027)/경유(D047) TOP10을
//       X(트위터)·티스토리에 쉽게 올리도록 텍스트/HTML 복사 + 이미지 카드 다운로드를 제공.
// 데이터: 우리 DB만 사용(외부 API 호출 없음). queryDailyTop10(prices_latest+stations).
//
// 보호 방식: 관리자 이메일 게이트(ADMIN_EMAILS) + noindex.
//   - 로그인 이메일이 ADMIN_EMAILS(콤마구분)에 포함될 때만 접근 허용. 아니면 notFound().
//   - ADMIN_EMAILS 미설정 시 "관리자 없음" → 접근 거부(lib/auth/admin.ts 참고).
//   - 이메일 하드코딩 금지. og 이미지 라우트(/api/og/daily-top10)는 공개 데이터라 가드 불필요.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminOrNull } from '@/lib/auth/admin';
import { queryDailyTop10 } from '@/lib/db/queries';
import { todayKstLabel } from '@/lib/daily-top10';
import { DailyTop10Client } from './DailyTop10Client';

// 검색엔진 노출 차단(운영자 전용 화면).
export const metadata: Metadata = {
  title: '매일 최저가 TOP10 (운영)',
  robots: { index: false, follow: false },
};

// 매 요청 시 최신 DB 값으로(캐시 안 함). 운영자가 새로고침하면 갱신.
export const dynamic = 'force-dynamic';

export default async function DailyTop10Page() {
  // 관리자 이메일 게이트(ADMIN_EMAILS). 비관리자/비로그인은 404로 가린다(존재 비노출).
  if (!(await getAdminOrNull())) notFound();

  const [gasoline, diesel] = await Promise.all([
    queryDailyTop10('B027'),
    queryDailyTop10('D047'),
  ]);
  const date = todayKstLabel();

  return <DailyTop10Client date={date} gasoline={gasoline} diesel={diesel} />;
}
