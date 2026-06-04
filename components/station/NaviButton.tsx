'use client';

import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { usePathname } from 'next/navigation';
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
  const { status } = useSession();
  const pathname = usePathname();

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
    // 회원 전용 동작 — 길찾기는 로그인 회원만 사용(FR-5 기반 UX 정책).
    // 비로그인(unauthenticated)이면 기존 인증 유도 패턴(next-auth signIn)을 그대로 재사용해
    // 로그인/회원가입으로 보내고, 완료 후 현재 상세 화면(/station/[id] 또는 /ev/[statId])으로 복귀.
    // 세션 확인 중(loading)에는 막지 않고 통과시킨다(깜빡임/오차단 방지).
    if (status === 'unauthenticated') {
      signIn(undefined, { callbackUrl: pathname ?? '/' });
      return;
    }
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
      className="w-full rounded-xl bg-primary py-3.5 text-center font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-60"
    >
      {starting ? '길찾기 여는 중…' : '카카오맵으로 길찾기'}
    </button>
  );
}
