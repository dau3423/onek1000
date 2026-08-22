'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { RepairBrand } from '@/types/repair';
import { REPAIR_BRAND_COLOR } from '@/types/repair';

/**
 * 정비소 브랜드 칩 — 목록에서 브랜드 지점을 한눈에 구분한다.
 *
 * 유형 뱃지(RepairTypeBadge)와 달리 색을 Tailwind 팔레트가 아니라 브랜드 색(REPAIR_BRAND_COLOR)에서
 * 직접 가져온다. 지도 마커와 **같은 색을 써야** "지도에서 본 그 색"과 목록이 연결되기 때문이다.
 * 그래서 배경은 그 색의 옅은 변형(투명도)으로 깔고 글자는 원색으로 둔다 — 라이트/다크 모두에서
 * 대비가 유지되고, 팔레트를 새로 만들 필요도 없다.
 *
 * 로고는 쓰지 않는다(상표권). 색 + 텍스트 라벨로만 구분한다.
 */
export function RepairBrandBadge({
  brand,
  size = 'sm',
}: {
  brand: RepairBrand;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('map.repairBrandMarkerLabel');
  const color = REPAIR_BRAND_COLOR[brand];
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded-full border font-bold leading-none',
        size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]',
      )}
      style={{ color, borderColor: `${color}66`, background: `${color}14` }}
    >
      {t(brand)}
    </span>
  );
}
