'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { RepairBrand } from '@/types/repair';
import { REPAIR_BRAND_COLOR, REPAIR_BRAND_COLOR_DARK } from '@/types/repair';

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
  forceLight = false,
}: {
  brand: RepairBrand;
  size?: 'sm' | 'md';
  /**
   * true 면 다크 변형 없이 라이트 색만 쓴다 — 상세 페이지처럼 **항상 흰 배경**인 화면용.
   * 이게 없으면 OS 가 다크일 때 흰 배경 위에 다크용 밝은 색이 찍혀 대비가 3.2:1 로 무너진다
   * (CarwashTypeBadge 가 같은 이유로 같은 prop 을 갖고 있다).
   */
  forceLight?: boolean;
}) {
  const t = useTranslations('map.repairBrandMarkerLabel');
  // 인라인 style 로는 dark: 변형을 쓸 수 없어, 두 색을 CSS 변수로 넘기고
  // globals.css 의 .brand-chip 규칙이 테마에 따라 고르게 한다.
  const color = REPAIR_BRAND_COLOR[brand];
  const colorDark = REPAIR_BRAND_COLOR_DARK[brand];
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded-full border font-bold leading-none',
        // forceLight 면 .brand-chip(테마 전환) 규칙을 붙이지 않고 라이트 색만 인라인으로 쓴다.
        !forceLight && 'brand-chip',
        size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]',
      )}
      style={
        forceLight
          ? { color, borderColor: `${color}66`, background: `${color}14` }
          : ({ '--bc': color, '--bcd': colorDark } as React.CSSProperties)
      }
    >
      {t(brand)}
    </span>
  );
}
