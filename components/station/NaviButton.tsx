'use client';

import { useState } from 'react';
import { startKakaoNavi, type NaviOrigin } from '@/lib/map/navi';

interface Props {
  name: string;
  lat: number;
  lng: number;
}

/**
 * 상세 페이지 "카카오맵으로 길찾기" 버튼.
 * 클릭 시 현재 위치(GPS)를 1회 획득해 출발지로 넘기고, 실패/거부 시 도착지만으로
 * graceful 하게 길안내를 시작한다. (BottomSheet의 startKakaoNavi 방식과 통일)
 */
export function NaviButton({ name, lat, lng }: Props) {
  const [starting, setStarting] = useState(false);

  /** 현재 위치 1회 획득. 실패/거부/미지원 시 null. */
  function getOrigin(): Promise<NaviOrigin | null> {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }

  async function handleClick() {
    setStarting(true);
    try {
      const origin = await getOrigin();
      await startKakaoNavi({ name, lat, lng }, origin);
    } finally {
      setStarting(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={starting}
      className="block w-full rounded-xl bg-primary py-3.5 text-center font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-60"
    >
      {starting ? '길찾기 여는 중…' : '🧭 카카오맵으로 길찾기'}
    </button>
  );
}
