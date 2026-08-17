// 번역 대상 서브트리의 레이아웃 — 여기서만 로케일 쿠키를 읽는다.
//
// force-dynamic 인 이유: i18n/request.ts 가 cookies() 를 읽으므로 이 트리는 요청 시점에 렌더돼야 한다.
//   / · /search · /route 는 그전까지 정적 프리렌더였는데, 세 페이지 모두 데이터를 클라이언트에서
//   가져오므로 SSR 은 껍데기만 렌더한다. 이 대가로 서버가 첫 HTML 을 이미 해당 언어로 내보내
//   "한국어가 보였다가 바뀌는" 깜빡임이 사라진다.
//
// 루트 레이아웃(app/layout.tsx)에 두지 않는 이유: 루트에서 쿠키를 읽으면 하위 전체가 동적이 되어
//   /regions SSG 291페이지가 사라진다.
import { NextIntlClientProvider } from 'next-intl';
import { HtmlLangSync } from '@/components/i18n/HtmlLangSync';

export const dynamic = 'force-dynamic';

export default function IntlLayout({ children }: { children: React.ReactNode }) {
  // next-intl v4: 로케일·메시지는 i18n/request.ts 에서 자동으로 주입되므로 props 가 필요 없다.
  return (
    <NextIntlClientProvider>
      <HtmlLangSync />
      {children}
    </NextIntlClientProvider>
  );
}
