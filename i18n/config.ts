// 지원 로케일 단일 출처 — 미들웨어·요청 설정·전환 UI·검증 스크립트가 모두 여기를 본다.
export const LOCALES = ['ko', 'en', 'zh', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

/** 감지 실패·미지원 언어의 폴백. 서비스 원본 언어. */
export const DEFAULT_LOCALE: Locale = 'ko';

/** 쿠키 이름. httpOnly 가 아니다 — 전환 UI가 클라이언트에서 써야 한다. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** 전환 UI 표기. 각 언어를 그 언어로 적는다 — 못 읽는 언어로 적힌 목록은 쓸모가 없다. */
export const LOCALE_LABEL: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  zh: '中文',
  ja: '日本語',
};

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
