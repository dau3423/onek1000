'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { SHEET_PEEK_PX } from '@/components/ui/BottomSheet';

declare global {
  interface Window {
    adsbygoogle?: object[];
  }
}

interface Props {
  /** 부모에서 강제로 숨기고 싶을 때 (예: 구독자 즉시 OFF) */
  hide?: boolean;
  /**
   * 하단 시트가 펼쳐진 상태 — 배너가 시트 콘텐츠 위에 떠 거슬리지 않도록 임시로 숨긴다.
   * GPS 버튼과 동일한 sheetOpen 상태 소스를 공유해 fade-out + 클릭 차단으로 처리한다.
   * (구독자/hide와 달리 DOM은 유지하고 opacity로만 숨겨 접히면 부드럽게 재등장한다.)
   */
  sheetOpen?: boolean;
}

/**
 * 배너 레이아웃 상수 (단일 출처).
 * GPS 버튼 등 배너 위치에 맞춰 떠야 하는 요소가 동일 값을 참조한다.
 */
/** 배너와 시트 peek 사이 시각적 간격(px) */
const BANNER_SHEET_GAP_PX = 8;
/**
 * 배너 컨테이너의 맵 하단 기준 bottom 오프셋(px) — 접힌 시트 peek 바로 위에 얹힌다.
 * 시트 peek 높이(SHEET_PEEK_PX)에 연동되므로 peek가 바뀌어도 배너가 시트에 가려지지 않는다.
 *
 * 시트는 컨테이너 하단(bottom-0)에서 translate-y로만 peek(SHEET_PEEK_PX)를 노출하며
 * peek 위치 자체에는 safe-area를 더하지 않는다(home indicator는 시트 내부 pb로만 보정).
 * 따라서 배너 bottom에도 safe-area를 더하면 안 된다 — 더하면 iOS(home indicator ~34px)에서만
 * 배너와 시트 peek 사이 간격이 BANNER_SHEET_GAP_PX + safe-area로 벌어진다. peek와 동일한
 * 좌표계(safe-area 미가산)를 써서 기기 무관하게 BANNER_SHEET_GAP_PX 고정 간격을 유지한다.
 */
export const BANNER_BOTTOM_PX = SHEET_PEEK_PX + BANNER_SHEET_GAP_PX;
/** 배너 컨테이너의 시각적 높이(px) — minHeight(50) + pb-2(8) 여유 포함 */
export const BANNER_HEIGHT_PX = 58;

/**
 * 현재 세션에서 배너가 실제로 보이는지 여부.
 * GPS 버튼 위치 계산이 BannerAd와 동일한 표시 조건을 공유하도록 훅으로 제공한다.
 */
export function useBannerVisible(hide?: boolean): boolean {
  const { data } = useSession();
  const isPremium = Boolean(data?.user?.isPremium);
  return !hide && !isPremium;
}

export function BannerAd({ hide, sheetOpen }: Props) {
  const { data } = useSession();
  const isPremium = Boolean(data?.user?.isPremium);

  // 시트 펼침 시 fade-out + 클릭 차단(GPS 버튼과 동일 톤). 접히면 다시 보인다.
  const sheetHiddenCls = sheetOpen ? 'pointer-events-none opacity-0' : 'opacity-100';

  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const slot = process.env.NEXT_PUBLIC_ADSENSE_BANNER_SLOT;
  const ref = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    if (hide || isPremium || !client || !slot) return;
    // adsbygoogle 스크립트가 layout에서 lazy 로드되었다고 가정
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('adsense push fail', e);
    }
  }, [hide, isPremium, client, slot]);

  if (hide || isPremium) return null;

  // AdSense 미설정 → 자체 CTA 폴백
  // bottom은 BANNER_BOTTOM_PX(=시트 peek + 간격) 고정. safe-area는 더하지 않아 기기 무관 동일 간격.
  if (!client || !slot) {
    return (
      <div
        className={`pointer-events-auto absolute inset-x-0 z-30 flex justify-center px-3 pb-2 transition-opacity duration-300 ${sheetHiddenCls}`}
        style={{ bottom: `${BANNER_BOTTOM_PX}px` }}
        aria-hidden={sheetOpen}
      >
        <Link
          href="/pricing"
          className="flex w-full max-w-md items-center justify-between rounded-lg bg-gradient-to-r from-primary to-primary-dark px-4 py-2.5 text-white shadow-lg"
        >
          <div>
            <div className="text-[11px] opacity-90">광고가 거슬리신가요?</div>
            <div className="text-sm font-bold">월 1,000원 → 광고 OFF</div>
          </div>
          <span className="text-xs font-bold">자세히 →</span>
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto absolute inset-x-0 z-30 flex justify-center px-3 pb-2 transition-opacity duration-300 ${sheetHiddenCls}`}
      style={{ bottom: `calc(${BANNER_BOTTOM_PX}px + env(safe-area-inset-bottom))` }}
      aria-hidden={sheetOpen}
    >
      <ins
        ref={ref}
        className="adsbygoogle block w-full max-w-md"
        style={{ display: 'block', minHeight: 50 }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
