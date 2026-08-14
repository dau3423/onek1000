'use client';

// 주유소 상세 열람 계측 — 상세 페이지(서버 컴포넌트)에 얹는 얇은 클라이언트 트래커.
// 마운트 시 station_detail_view 1건을 fire-and-forget으로 전송한다.
//  - 상세 페이지가 열릴 때마다 1건(세션 내 dedupe 없음 — 재열람도 카운트).
//  - props에는 stationId(공개 오피넷 ID)만 담는다(좌표/주소 등 개인정보성 값 금지).
//  - 렌더 결과 없음(계측 전용). 전송 실패는 track() 내부에서 무시되어 UX를 깨지 않는다.

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

export function StationViewTracker({ stationId }: { stationId: string }) {
  useEffect(() => {
    track('station_detail_view', { stationId });
  }, [stationId]);

  return null;
}
