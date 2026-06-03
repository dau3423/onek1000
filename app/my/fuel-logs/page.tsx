import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { FuelLogManager } from '@/components/fuel/FuelLogManager';

export default async function FuelLogsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/sign-in?callbackUrl=/my/fuel-logs');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <Link href="/my" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="font-bold text-gray-900">내 기록</h1>
      </header>

      <section className="px-5 py-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <FuelLogManager />
      </section>
    </main>
  );
}
