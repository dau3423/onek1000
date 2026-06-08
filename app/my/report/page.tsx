import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { FuelReport } from '@/components/fuel/FuelReport';

// 차계부 / 주유비 리포트 페이지 — 모든 회원 무료(프리미엄 게이트 없음).
// 비로그인은 로그인 유도(기존 패턴). 데이터는 우리 DB(fuel_logs) 집계만.
export default async function FuelReportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/sign-in?callbackUrl=/my/report');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white dark:bg-gray-950">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <Link
          href="/my"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          ←
        </Link>
        <h1 className="font-bold text-gray-900 dark:text-gray-100">주유 리포트</h1>
      </header>

      <section className="px-5 py-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <FuelReport />
      </section>
    </main>
  );
}
