import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FuelIcon } from '@/components/icons';

export default async function NotFound() {
  const t = await getTranslations('station');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <FuelIcon className="h-12 w-12 text-gray-300" />
      <h1 className="text-xl font-bold text-gray-900">{t('notFound.title')}</h1>
      <p className="text-sm text-gray-500">{t('notFound.description')}</p>
      <Link href="/" className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
        {t('notFound.backToMap')}
      </Link>
    </main>
  );
}
