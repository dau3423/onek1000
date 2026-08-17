'use client';

// <html lang> 은 정적 루트 레이아웃(app/layout.tsx)에 있어 서버에서 로케일별로 바꿀 수 없다.
// (바꾸려면 루트에서 쿠키를 읽어야 하고, 그러면 /regions SSG 291페이지가 사라진다.)
// 그래서 (intl) 트리에서만 클라이언트로 맞춘다. 스크린리더·브라우저 번역기 인식용이며,
// 한국어 SEO 페이지는 lang="ko" 로 남으므로 검색 영향이 없다.
import { useEffect } from 'react';
import { useLocale } from 'next-intl';

export function HtmlLangSync() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
