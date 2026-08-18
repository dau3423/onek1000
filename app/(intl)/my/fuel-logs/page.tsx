import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth/options';
import { BackButton } from '@/components/common/BackButton';
import { FuelLogManager } from '@/components/fuel/FuelLogManager';

export default async function FuelLogsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/sign-in?callbackUrl=/my/fuel-logs');
  const t = await getTranslations('my');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton href="/my" ariaLabel={t('backAria')} />
        <h1 className="font-bold text-gray-900">{t('myRecordsHeading')}</h1>
      </header>

      <section className="px-5 py-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <FuelLogManager />
      </section>
    </main>
  );
}
