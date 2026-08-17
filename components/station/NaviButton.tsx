'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  startNavi,
  getPreferredNavi,
  setPreferredNavi,
  availableNaviProviders,
  NAVI_PROVIDER_LABEL,
  type NaviOrigin,
  type NaviProvider,
} from '@/lib/map/navi';
import { NaviAppPicker } from '@/components/alert/NaviApps';
import { track } from '@/lib/analytics';

interface Props {
  name: string;
  lat: number;
  lng: number;
  /**
   * 계측용 공개 시설 ID(있으면 navi_click 이벤트에 동봉). 주유소=오피넷 ID, EV=환경공단 충전소 ID.
   * 둘 다 개인정보가 아닌 공개 식별자다. 좌표/이름은 전송하지 않는다.
   */
  stationId?: string;
}

/**
 * 상세 페이지 "길찾기" 버튼.
 * 선호 앱이 저장돼 있으면 그 앱으로 즉시 실행하고, 없으면 앱 선택 시트를 띄운다.
 * 실행 직전 현재 위치(GPS)를 1회 획득해 출발지로 넘기고, 실패/거부 시 도착지만으로
 * graceful 하게 길안내를 시작한다.
 */
export function NaviButton({ name, lat, lng, stationId }: Props) {
  const t = useTranslations('station.navi');
  const [starting, setStarting] = useState(false);
  const [picking, setPicking] = useState(false);
  // 선호 앱 라벨: SSR 하이드레이션 불일치 방지를 위해 마운트 후 읽는다.
  const [preferred, setPreferred] = useState<NaviProvider | null>(null);
  const { status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    const saved = getPreferredNavi();
    setPreferred(saved && availableNaviProviders().includes(saved) ? saved : null);
  }, []);

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

  /** 선택된 앱으로 실행. 선호 앱으로 기억한 뒤 GPS 획득 → 길안내. */
  async function run(provider: NaviProvider) {
    setPicking(false);
    setStarting(true);
    try {
      setPreferredNavi(provider);
      setPreferred(provider);
      const origin = await getOrigin();
      await startNavi(provider, { name, lat, lng }, origin);
    } finally {
      setStarting(false);
    }
  }

  function handleClick() {
    // 회원 전용 동작 — 길찾기는 로그인 회원만 사용(FR-5 기반 UX 정책).
    // 비로그인(unauthenticated)이면 기존 인증 유도 패턴(next-auth signIn)을 그대로 재사용해
    // 로그인/회원가입으로 보내고, 완료 후 현재 상세 화면(/station/[id] 또는 /ev/[statId])으로 복귀.
    // 세션 확인 중(loading)에는 막지 않고 통과시킨다(깜빡임/오차단 방지).
    if (status === 'unauthenticated') {
      signIn(undefined, { callbackUrl: pathname ?? '/' });
      return;
    }
    // 길찾기 CTA 클릭 계측 — fire-and-forget(전송 실패/차단도 아래 이동을 지연/차단하지 않음).
    if (stationId) track('navi_click', { stationId });

    const saved = getPreferredNavi();
    const usable = saved && availableNaviProviders().includes(saved) ? saved : null;
    if (usable) {
      run(usable);
    } else {
      // 선호 앱이 없으면 선택 시트를 띄운다(선택 시 저장 + 실행).
      setPicking(true);
    }
  }

  const label = preferred
    ? t('buttonLabelWithProvider', { provider: NAVI_PROVIDER_LABEL[preferred] })
    : t('buttonLabel');

  return (
    <>
      <button
        onClick={handleClick}
        disabled={starting}
        className="w-full rounded-xl bg-primary py-3.5 text-center font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-60"
      >
        {starting ? t('opening') : label}
      </button>
      {picking ? (
        <NaviAppPicker
          subtitle={name}
          onPick={run}
          onClose={() => setPicking(false)}
          disabled={starting}
        />
      ) : null}
    </>
  );
}
