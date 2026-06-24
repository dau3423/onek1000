'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActiveNoticeResponse } from '@/types/notice';

type ActiveNotice = NonNullable<ActiveNoticeResponse['notice']>;

/** KST(UTC+9) 기준 오늘 날짜 'YYYY-MM-DD'. "오늘 하루 보지 않기" 판정용. */
function kstToday(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 공지별 "오늘 하루 보지 않기" 저장 키(공지 id별로 분리 → 새 공지는 다시 노출). */
function hideKey(id: string): string {
  return `noticeHideUntil:${id}`;
}

/**
 * 첫 화면 공지 팝업.
 * - 마운트 시 /api/notice로 활성 공지 1건을 조회해, 있으면 이미지 팝업으로 띄운다(전체 사용자).
 * - 이미지를 터치하면 연결된 link_url로 이동(내부 경로는 router, 외부는 새 탭으로 열기).
 * - "오늘 하루 보지 않기" 선택 시 KST 당일 자정까지 같은 공지를 숨긴다(localStorage, 공지 id별).
 * - SSR 안전: 모든 판단을 클라이언트 effect에서 수행(깜빡임 방지).
 */
export function NoticePopup() {
  const router = useRouter();
  const [notice, setNotice] = useState<ActiveNotice | null>(null);
  const [open, setOpen] = useState(false);

  // 활성 공지 조회 + "오늘 하루 보지 않기" 판정.
  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/notice', { signal: ac.signal, cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<ActiveNoticeResponse>) : null))
      .then((data) => {
        const n = data?.notice;
        if (!n) return;
        try {
          if (localStorage.getItem(hideKey(n.id)) === kstToday()) return; // 오늘 숨김
        } catch {
          /* 프라이빗 모드 등: 노출은 하되 숨김은 세션 한정 */
        }
        setNotice(n);
        setOpen(true);
      })
      .catch(() => {
        /* 조회 실패 시 조용히 미노출(앱 동작엔 영향 없음) */
      });
    return () => ac.abort();
  }, []);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !notice) return null;

  const hideToday = () => {
    try {
      localStorage.setItem(hideKey(notice.id), kstToday());
    } catch {
      /* noop */
    }
    setOpen(false);
  };

  const goLink = () => {
    const url = notice.linkUrl;
    if (!url) return;
    setOpen(false);
    if (url.startsWith('/')) {
      router.push(url); // 앱 내부 경로
    } else {
      window.open(url, '_blank', 'noopener,noreferrer'); // 외부 링크는 새 탭
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="공지"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-[360px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="닫기"
          className="absolute right-2.5 top-2.5 z-10 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {/* 공지 이미지 — 링크가 있으면 터치 시 이동 */}
        {notice.linkUrl ? (
          <button type="button" onClick={goLink} className="block w-full" aria-label="공지 링크로 이동">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={notice.imageUrl} alt="공지" className="block max-h-[70vh] w-full object-contain" />
          </button>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={notice.imageUrl} alt="공지" className="block max-h-[70vh] w-full object-contain" />
        )}

        {/* 하단 액션 바: 오늘 하루 보지 않기 / 닫기 */}
        <div className="flex items-stretch border-t border-gray-100 text-sm dark:border-gray-800">
          <button
            onClick={hideToday}
            className="flex-1 py-3 font-medium text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            오늘 하루 보지 않기
          </button>
          <span className="w-px bg-gray-100 dark:bg-gray-800" aria-hidden />
          <button
            onClick={() => setOpen(false)}
            className="flex-1 py-3 font-bold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
