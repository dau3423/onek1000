'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Props { stationId: string }

export function FavoriteButton({ stationId }: Props) {
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
      signIn(undefined, { callbackUrl: `/station/${encodeURIComponent(stationId)}` });
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
      aria-label="즐겨찾기"
      className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-50"
    >
      {fav ? '♥' : '♡'}
    </button>
  );
}
