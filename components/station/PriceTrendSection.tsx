'use client';

// 상세 가격 추이 섹션 — 서버 컴포넌트라 탭 상태를 가질 수 없어 클라이언트로 분리.
// 선택 유종은 FuelSelectionProvider가 공유하고, 이 섹션은 제목/탭/차트를 렌더한다.
// 차트는 [stationId, product] deps로 자동 재조회되므로 추가 배선이 필요 없다.
import { useTranslations } from 'next-intl';
import { PriceHistoryChart } from '@/components/charts/PriceHistoryChart';
import { useProductLabel } from '@/lib/i18n/labels';
import { useFuelSelection } from './FuelSelectionProvider';

export function PriceTrendSection({ stationId }: { stationId: string }) {
  const t = useTranslations('station.trend');
  const productLabelOf = useProductLabel();
  const { selected, setSelected, available } = useFuelSelection();
  // non-null 유종이 2개 이상일 때만 탭 렬 노출(1개면 제목 라벨만, 0개면 폴백 B027).
  const showTabs = available.length >= 2;

  return (
    <section className="border-t border-gray-100 px-5 py-4">
      <h2 className="mb-2 text-sm font-bold text-gray-800">
        {t('title', { product: productLabelOf(selected) })}
      </h2>
      {showTabs && (
        <div role="tablist" aria-label={t('tabAria')} className="mb-3 flex flex-wrap gap-2">
          {available.map((p) => {
            const active = p === selected;
            return (
              <button
                key={p}
                role="tab"
                aria-selected={active}
                aria-controls="price-trend-panel"
                onClick={() => setSelected(p)}
                className={
                  active
                    ? 'rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-white'
                    : 'rounded-full bg-gray-100 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }
              >
                {productLabelOf(p)}
              </button>
            );
          })}
        </div>
      )}
      <div id="price-trend-panel" role="tabpanel">
        <PriceHistoryChart stationId={stationId} product={selected} />
      </div>
    </section>
  );
}
