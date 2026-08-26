// 긴급출동 화면 (/emergency) — 사고·고장 현장에서 쓰는 화면.
//
// 로그인을 요구하지 않는다: 급할 때 로그인을 시키는 건 최악이고, 전체 보험사 목록은
// 누구에게나 즉시 필요하다. 로그인은 '내 보험사 고정'이라는 편의만 더한다.
//
// 다른 상세 화면과 같이 라이트 전용으로 고정한다 — 야간 사고 현장에서도 대비가 확실해야 한다.

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BackButton } from '@/components/common/BackButton';
import { EmergencyClient } from './EmergencyClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('emergency');
  // i18n-ignore: '1000냥 주유소'는 브랜드 고유명사라 번역하지 않는다(다른 페이지 메타와 동일 표기).
  return { title: `${t('pageTitle')} | 1000냥 주유소`, description: t('metaDescription') };
}

// 위치 기반 화면이라 정적 캐싱하지 않는다.
export const dynamic = 'force-dynamic';

export default async function EmergencyPage() {
  const tCommon = await getTranslations('common');
  const t = await getTranslations('emergency');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton ariaLabel={tCommon('backAria')} />
        <h1 className="flex-1 truncate font-bold text-gray-900">{t('pageTitle')}</h1>
      </header>
      <EmergencyClient />
    </main>
  );
}
