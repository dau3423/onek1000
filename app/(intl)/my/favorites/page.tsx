import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { BackButton } from '@/components/common/BackButton';
import { ChevronRightIcon, HeartIcon } from '@/components/icons';
import { BRAND_COLOR, type BrandCode } from '@/types/station';

interface FavRow {
  station_id: string;
  // Supabase는 join 결과를 배열로 반환 (관계 카디널리티와 무관). 첫 원소를 사용.
  stations: { id: string; name: string; brand_code: string }[] | null;
}

export default async function FavoritesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/sign-in?callbackUrl=/my/favorites');
  const t = await getTranslations('my');
  const tLabels = await getTranslations('labels');

  let favs: FavRow[] = [];
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data: user } = await sb.from('users').select('id').eq('email', session.user.email).maybeSingle();
    if (user) {
      const { data } = await sb
        .from('favorites')
        .select('station_id, stations(id, name, brand_code)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      favs = (data ?? []) as FavRow[];
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton href="/my" ariaLabel={t('backAria')} />
        <h1 className="font-bold text-gray-900">{t('favorites.pageHeading', { count: favs.length })}</h1>
      </header>

      {favs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <HeartIcon className="h-12 w-12 text-gray-300" />
          <p className="text-sm text-gray-500">{t('favorites.emptyMessage')}</p>
          <Link href="/" className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
            {t('findOnMap')}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {favs.map((f) => {
            const station = f.stations?.[0];
            const brand = (station?.brand_code as BrandCode) ?? 'ETC';
            return (
              <li key={f.station_id}>
                <Link
                  href={`/station/${encodeURIComponent(f.station_id)}`}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50"
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: BRAND_COLOR[brand] }}
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{station?.name ?? f.station_id}</div>
                    <div className="text-xs text-gray-500">{tLabels(`brand.${brand}`)}</div>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-xs text-primary">
                    {t('favorites.detailAction')}<ChevronRightIcon className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
