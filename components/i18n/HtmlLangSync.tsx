'use client';

// <html lang> 은 정적 루트 레이아웃(app/layout.tsx)에 있어 서버에서 로케일별로 바꿀 수 없다.
// (바꾸려면 루트에서 쿠키를 읽어야 하고, 그러면 /regions SSG 291페이지가 사라진다.)
// 그래서 (intl) 트리에서만 클라이언트로 맞춘다. 스크린리더·브라우저 번역기 인식용이며,
// 한국어 SEO 페이지는 lang="ko" 로 남으므로 검색 영향이 없다.
import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { track } from '@/lib/analytics';

const LOCALE_TRACKED_KEY = 'locale_tracked';

export function HtmlLangSync() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // 감지·선택된 로케일을 로케일 값이 바뀔 때만 계측한다(세션당 로케일별 1회).
  // 이 레이아웃은 force-dynamic 이라 재렌더가 잦으므로, 바른 "이미 보냄" 가드가 없으면
  // 매 렌더/네비게이션마다 전송되어 분포가 부풀려진다. 반대로 바른 값이 바뀌면(=사용자가
  // 감지된 언어를 바꿨다는 신호) 다시 1건 보내야 그 스위치 자체가 데이터로 남는다.
  // sessionStorage는 프라이빗 브라우징 등에서 접근 시 throw할 수 있어 페이지를 깨뜨리지
  // 않도록 감싼다(stores/map.ts 의 sessionStorage 처리와 동일한 패턴).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(LOCALE_TRACKED_KEY) === locale) return;
      sessionStorage.setItem(LOCALE_TRACKED_KEY, locale);
    } catch {
      // 프라이빗 모드 등 sessionStorage 불가 환경 — dedupe 없이 계측만 계속 진행
    }
    track('locale_active', { locale });
  }, [locale]);

  return null;
}
