'use client';

// 주유 타이밍 예측 — 마이페이지용 미니카드.
// 전국(nation) 기준 휘발유(기본) 방향 신호만 컴팩트하게 보여주고, 탭하면 메인 예측 카드로 딥링크한다.
//  - latest 신호가 없으면 컴포넌트 전체(섹션 헤더 포함) 미렌더 → 빈 섹션이 남지 않게(graceful).
//  - 데이터 페칭은 ForecastCard와 동일한 useEffect + AbortController + fetch 패턴(react-query 미도입).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ProductCode } from '@/types/station';
import { useProductLabel } from '@/lib/i18n/labels';
import { ChevronRightIcon } from '@/components/icons';

type Direction = 'up' | 'flat' | 'down';

// latest 만 쓰므로 최소 정의(전체 ForecastResponse 의존 회피).
interface MiniResponse {
  latest: {
    direction: Direction;
  } | null;
}

// 방향 신호등(상승=빨강▲ / 보합=회색─ / 하락=파랑▼) 화살표·색.
const DIR_STYLE: Record<Direction, { arrow: string; color: string }> = {
  up: { arrow: '▲', color: 'text-expensive' },
  flat: { arrow: '─', color: 'text-gray-500 dark:text-gray-400' },
  down: { arrow: '▼', color: 'text-blue-600 dark:text-blue-400' },
};

export default function ForecastMiniCard({ product = 'B027' }: { product?: ProductCode }) {
  const t = useTranslations('forecast');
  const productLabel = useProductLabel();
  const [latest, setLatest] = useState<MiniResponse['latest']>(null);

  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams({ product, region: 'nation' });
    fetch(`/api/forecast?${params}`, { signal: ac.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as MiniResponse) : null))
      .then((d) => setLatest(d?.latest ?? null))
      .catch((e) => {
        if (e?.name !== 'AbortError') setLatest(null);
      });
    return () => ac.abort();
  }, [product]);

  // graceful: 신호 없으면 섹션 자체를 렌더하지 않는다.
  if (!latest) return null;

  const style = DIR_STYLE[latest.direction];
  const label = t(`miniCard.direction.${latest.direction}`);

  return (
    <section className="border-t border-gray-100 px-5 py-5">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{t('miniCard.heading')}</h2>
      <Link href="/?forecast=1" className="flex items-center justify-between rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
        <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <span className={`text-base font-bold ${style.color}`} aria-hidden>
            {style.arrow}
          </span>
          {productLabel(product)} {label}
        </span>
        <span className="inline-flex items-center gap-0.5 text-sm text-primary">
          {t('miniCard.detailLabel')}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      </Link>
    </section>
  );
}
