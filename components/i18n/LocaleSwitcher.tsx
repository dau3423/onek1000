'use client';

// 헤더 언어 전환. 쿠키를 갱신하고 router.refresh() 로 서버 컴포넌트를 새 언어로 다시 렌더한다.
// (intl) 레이아웃이 force-dynamic 이라 refresh 하면 서버가 새 로케일로 HTML 을 다시 만든다.
//
// 쿠키를 직접 쓰는 이유: NEXT_LOCALE 은 httpOnly 가 아니고(미들웨어에서 그렇게 설정했다),
// 서버 액션 없이 한 줄로 끝난다.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LOCALES, LOCALE_LABEL, LOCALE_COOKIE, type Locale } from '@/i18n/config';
import { GlobeIcon } from '@/components/icons';
import clsx from 'clsx';

const ONE_YEAR = 60 * 60 * 24 * 365;

export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    setOpen(false);
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('changeLanguage')}
        title={t('changeLanguage')}
        className="tap-press flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100"
      >
        <GlobeIcon className="h-[26px] w-[26px] text-gray-700" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('changeLanguage')}
          className="absolute right-0 top-12 z-50 w-32 rounded-xl border border-gray-100 bg-white p-1 shadow-lg"
        >
          {LOCALES.map((l) => (
            <button
              key={l}
              role="menuitemradio"
              aria-checked={l === locale}
              onClick={() => select(l)}
              className={clsx(
                'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition',
                l === locale ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              {/* 각 언어를 그 언어로 표기한다 — 못 읽는 언어로 적힌 목록은 쓸모가 없다. */}
              {LOCALE_LABEL[l]}
              {l === locale && (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
