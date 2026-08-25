'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { requireLogin } from '@/lib/auth/gate';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { HeartIcon, HeartFilledIcon } from '@/components/icons';

interface Props { stationId: string }

export function FavoriteButton({ stationId }: Props) {
  const t = useTranslations('common');
  const { status } = useSession();
  const router = useRouter();
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/favorites')
      .then((r) => r.json())
      .then((d: { favorites?: Array<{ station_id: string }> }) => {
        setFav(Boolean(d.favorites?.some((f) => f.station_id === stationId)));
      })
      .catch(() => undefined);
  }, [status, stationId]);

  const toggle = async () => {
    if (status !== 'authenticated') {
      requireLogin('favorite', `/station/${encodeURIComponent(stationId)}`);
      return;
    }
    setBusy(true);
    try {
      if (fav) {
        await fetch(`/api/favorites?stationId=${stationId}`, { method: 'DELETE' });
        setFav(false);
      } else {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stationId }),
        });
        setFav(true);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={t('favoriteAria')}
      aria-pressed={fav}
      className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-50"
    >
      {fav ? (
        <HeartFilledIcon className="h-6 w-6 text-red-500 transition-colors motion-reduce:transition-none" />
      ) : (
        <HeartIcon className="h-6 w-6 text-gray-500 transition-colors motion-reduce:transition-none" />
      )}
    </button>
  );
}
