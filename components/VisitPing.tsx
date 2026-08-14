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

/** 유입 채널 body — referrer 호스트(경로/쿼리 제외) + utm 3종. 개인정보성 값은 담지 않는다. */
interface VisitChannel {
  ref_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

/**
 * document.referrer에서 "호스트만" 추출한다(경로·쿼리·해시 제외, www. 접두 제거).
 * referrer가 없거나(직접 유입) 우리 도메인 내부 이동이면 null(직접 유입으로 취급).
 */
function readRefHost(): string | null {
  try {
    const ref = document.referrer;
    if (!ref) return null;
    const host = new URL(ref).hostname.replace(/^www\./, '');
    if (!host) return null;
    // 같은 도메인(내부 이동)은 유입 채널이 아니므로 직접(null)로 본다.
    if (host === location.hostname.replace(/^www\./, '')) return null;
    return host;
  } catch {
    return null;
  }
}

/** URL 쿼리에서 utm 3종만 읽는다(그 외 파라미터는 무시). 빈 값은 null. */
function readChannel(): VisitChannel {
  const sp = new URLSearchParams(location.search);
  const pick = (k: string): string | null => {
    const v = sp.get(k)?.trim();
    return v ? v.slice(0, 100) : null; // 과도한 길이 방어(최대 100자)
  };
  return {
    ref_host: readRefHost(),
    utm_source: pick('utm_source'),
    utm_medium: pick('utm_medium'),
    utm_campaign: pick('utm_campaign'),
  };
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

    // 유입 채널(referrer 호스트 + utm 3종)을 body로 동봉. first-touch(하루 첫 방문 채널만 저장).
    const channel = readChannel();

    let cancelled = false;
    (async () => {
      try {
        await fetch('/api/visit', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(channel),
        });
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
