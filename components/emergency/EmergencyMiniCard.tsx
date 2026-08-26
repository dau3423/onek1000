'use client';

// 홈 하단(지도 아래 흐름 영역)의 긴급출동 미니 카드.
//
// 왜 여기인가: 긴급 기능은 "급할 때 몇 번 만에 닿느냐"가 전부인데, 정작 급할 때 메뉴를 뒤지긴
// 어렵다. 그래서 **평소에 눈에 익히고 보험사를 미리 저장하게** 하는 자리가 필요하다.
// 마이페이지보다 이 자리가 훨씬 자주 보인다(세차 지수·주유 타이밍과 같은 흐름).
//
// ⚠️ 세차·주유타이밍 카드와 달리 **레이어를 가리지 않는다**. 그 둘은 주유소 레이어 전용
//    정보지만, 사고·고장은 어느 레이어를 보고 있든 난다 — 오히려 정비소 레이어에서 더 필요하다.
//
// 상태별로 보여주는 것이 다르다:
//   · 보험사 저장됨   → 번호와 전화 버튼(원터치). 여기서 바로 걸 수 있으면 화면 이동이 없다.
//   · 로그인·미저장   → 저장을 권하는 한 줄 + 긴급 화면 링크
//   · 비로그인        → 저장은 못 하므로 링크만(로그인을 강요하지 않는다)

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { findInsurer, telHref, type InsurerId } from '@/lib/insurance/companies';
import { track } from '@/lib/analytics';
import { PhoneIcon, ChevronRightIcon } from '@/components/icons';

export function EmergencyMiniCard() {
  const t = useTranslations('emergency.miniCard');
  const { status } = useSession();
  const [insurer, setInsurer] = useState<InsurerId | null>(null);

  // 로그인 상태에서만 조회한다 — 비로그인에 401 을 만들 이유가 없다.
  // status 가 확정된 뒤에만 부른다(loading 중 호출하면 세션 없이 나가 401 이 된다).
  useEffect(() => {
    if (status !== 'authenticated') return;
    let alive = true;
    fetch('/api/me/insurance')
      .then((r) => r.json())
      .then((j) => { if (alive) setInsurer((j?.insurer as InsurerId | null) ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [status]);

  const mine = findInsurer(insurer);

  return (
    <section className="mx-4 mb-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-gray-100">
          <PhoneIcon className="h-4 w-4 text-primary" />
          {t('title')}
        </h2>
        <Link
          href="/emergency"
          onClick={() => track('emergency_open', { from: 'home_card' })}
          className="flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          {mine ? t('allInsurers') : t('open')}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      {mine ? (
        <>
          <p className="mt-2 text-[12px] text-gray-500 dark:text-gray-400">{t('myInsurerLabel')}</p>
          <a
            href={telHref(mine.tel)}
            onClick={() => track('emergency_call', { insurer: mine.id, mine: true, from: 'home_card' })}
            className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-primary px-4 py-3 text-white"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{mine.name}</span>
              <span className="block text-lg font-extrabold tabular-nums leading-tight">{mine.tel}</span>
            </span>
            <PhoneIcon className="h-5 w-5 shrink-0" />
          </a>
        </>
      ) : (
        <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">
          {status === 'authenticated' ? t('setupHint') : t('anonHint')}
        </p>
      )}
    </section>
  );
}
