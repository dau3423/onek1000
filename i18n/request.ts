// next-intl 요청 설정 — 쿠키에서 로케일을 읽어 메시지를 공급한다(URL 로케일 없음).
// ⚠️ Next 14 에서 cookies() 는 동기 함수다. 공식 문서 예제는 Next 15 기준이라 await 가 붙어 있다.
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './config';
import koMessages from '../messages/ko.json';

/** "a.b.c" 경로로 중첩 객체에서 문자열 하나를 꺼낸다. 없으면 undefined. */
function lookup(obj: unknown, path: string): string | undefined {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export default getRequestConfig(async () => {
  const raw = cookies().get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // 키가 없으면 **한국어 문구로 대체**한다. 키 문자열이나 빈 문자열이 화면에 노출되면 안 된다
    // (빈 문자열은 버튼 라벨이 사라져 키 노출보다 나쁘다).
    // 번역이 덜 된 상태로 배포돼도 화면이 깨지지 않게 하는 장치다.
    getMessageFallback: ({ key, namespace }) => {
      const path = namespace ? `${namespace}.${key}` : key;
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[i18n] 누락된 키: ${path} (locale=${locale}) → 한국어로 대체`);
      }
      // ko 에도 없으면 최후로 키의 마지막 조각(사람이 알아볼 수 있는 형태)을 쓴다.
      return lookup(koMessages, path) ?? path.split('.').pop() ?? path;
    },
    onError: (err) => {
      if (process.env.NODE_ENV === 'development') console.warn('[i18n]', err.message);
    },
  };
});
