'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

// 방문 ping — 마운트 시 1회 /api/visit 호출(경로 변경마다가 아니라 앱 로드당 1회).
// 서버가 device_id 쿠키 발급 + page_visits 업서트를 처리한다(관리자 "오늘 방문자수(KST)" 카드용).
//
// 하루 1회면 충분하므로 localStorage에 visited:<KST-date> 플래그를 두어 오늘 이미 보냈으면
// 호출을 생략한다(서버 upsert와 이중 방어). 실패는 무시한다.

const KST_OFFSET_MS = 9 * 3600 * 1000;

function kstTodayDate(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function VisitPing() {
  useEffect(() => {
    const today = kstTodayDate();
    const key = `visited:${today}`;
    try {
      if (localStorage.getItem(key)) return; // 오늘 이미 ping 완료
    } catch {
      /* localStorage 접근 불가(사파리 프라이빗 등)면 그냥 ping 시도 */
    }

    // 퍼널 최상단: 앱 진입(일 단위 고유 디바이스). 방문 ping과 동일 주기로 1회 전송.
    track('landing_view');

    let cancelled = false;
    (async () => {
      try {
        await fetch('/api/visit', { method: 'POST', keepalive: true });
        if (cancelled) return;
        try {
          localStorage.setItem(key, '1');
        } catch {
          /* 저장 실패는 무시(다음 마운트 때 한 번 더 ping될 뿐, 서버 upsert가 멱등) */
        }
      } catch {
        /* 방문 ping 실패는 무시 */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
