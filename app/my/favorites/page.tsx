import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { BRAND_LABEL, BRAND_COLOR, type BrandCode } from '@/types/station';

interface FavRow {
  station_id: string;
  // Supabase는 join 결과를 배열로 반환 (관계 카디널리티와 무관). 첫 원소를 사용.
  stations: { id: string; name: string; brand_code: string }[] | null;
}

export default async function FavoritesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/sign-in?callbackUrl=/my/favorites');

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
        <Link href="/my" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="font-bold text-gray-900">즐겨찾기 ({favs.length})</h1>
      </header>

      {favs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-5xl">♡</div>
          <p className="text-sm text-gray-500">아직 즐겨찾기한 주유소가 없어요.</p>
          <Link href="/" className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
            지도에서 찾기
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
                  href={`/station/${f.station_id}`}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50"
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: BRAND_COLOR[brand] }}
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{station?.name ?? f.station_id}</div>
                    <div className="text-xs text-gray-500">{BRAND_LABEL[brand]}</div>
                  </div>
                  <span className="text-xs text-primary">상세 →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
