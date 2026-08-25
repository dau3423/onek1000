'use client';

// 지역 랜딩 헤더의 상시 노출 지도 링크.
//
// 본문 CTA(MapCta)와 별개로 **스크롤 내내 화면에 남는** 접점이다.
// 계측을 붙이기 위해 클라이언트 컴포넌트로 뺐다 — 헤더는 서버 레이아웃이라
// 여기서만 onClick 을 걸 수 있다. from='header' 로 본문 CTA 와 구분해 집계한다.

import Link from 'next/link';
import { track } from '@/lib/analytics';

export function RegionMapLink() {
  return (
    <Link
      href="/"
      onClick={() => track('region_map_cta', { from: 'header' })}
      className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3.5 py-2 text-[13px] font-bold text-white shadow-sm transition hover:brightness-95"
    >
      지도 열기
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
