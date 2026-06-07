// 매일 SNS 게시용 — 전국 최저가 TOP10 복붙 도우미 (운영자 전용)
//
// 목적: 운영자가 하루 1번 열어, 오늘자 전국 최저가 휘발유(B027)/경유(D047) TOP10을
//       X(트위터)·티스토리에 쉽게 올리도록 텍스트/HTML 복사 + 이미지 카드 다운로드를 제공.
// 데이터: 우리 DB만 사용(외부 API 호출 없음). queryDailyTop10(prices_latest+stations).
//
// 보호 방식: (a) 무인증 + noindex 로 운영(가장 간단, 북마크 사용). 검색 노출만 차단한다.
//   ─ (b) 관리자 이메일 게이트로 전환하려면 아래 GATE 블록 주석을 해제하고
//     환경변수 ADMIN_EMAILS(쉼표구분)에 운영자 이메일을 넣어라. 이메일 하드코딩 금지.
//
//     import { getServerSession } from 'next-auth';
//     import { authOptions } from '@/lib/auth/options';
//     import { redirect } from 'next/navigation';
//     const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
//     const session = await getServerSession(authOptions);
//     if (admins.length > 0 && !(session?.user?.email && admins.includes(session.user.email))) {
//       redirect('/'); // 또는 403 화면
//     }

import type { Metadata } from 'next';
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
  const [gasoline, diesel] = await Promise.all([
    queryDailyTop10('B027'),
    queryDailyTop10('D047'),
  ]);
  const date = todayKstLabel();

  return <DailyTop10Client date={date} gasoline={gasoline} diesel={diesel} />;
}
