'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { useMapStore, type MapLayer } from '@/stores/map';
import { type ProductCode } from '@/types/station';
import type { CarwashTypeFilter } from '@/types/carwash';
import { useProductLabel } from '@/lib/i18n/labels';
import { BrandFilter } from './BrandFilter';
import { BoltIcon, CarwashIcon, WrenchIcon, FuelIcon } from '@/components/icons';
import clsx from 'clsx';

// 주유소 드롭다운에 나열할 유종. 기존엔 '휘발유▾' 드롭다운(일반/고급)과 경유·LPG 칩이 따로
// 있어 유종 선택이 두 군데로 갈렸다. 이제 주유소 버튼 하나가 드롭다운을 열고 여기서 전부 고른다.
const FUEL_OPTIONS: ProductCode[] = ['B027', 'D047', 'B034', 'C004'];

// 레이어 전환 — 주유소/EV/세차장. '주유소'는 드롭다운 트리거를 겸한다(유종 선택).
const LAYER_OPTIONS: { value: MapLayer; labelKey: 'layerGas' | 'layerEv' | 'layerCarwash' | 'layerRepair'; Icon: ComponentType<{ className?: string }> }[] = [
  { value: 'gas', labelKey: 'layerGas', Icon: FuelIcon },
  { value: 'ev', labelKey: 'layerEv', Icon: BoltIcon },
  { value: 'carwash', labelKey: 'layerCarwash', Icon: CarwashIcon },
  { value: 'repair', labelKey: 'layerRepair', Icon: WrenchIcon },
];

// 세차장 레이어 유형(FR-3). 'all'=미확인 포함 전체(기본).
const CARWASH_TYPE_OPTIONS: { value: CarwashTypeFilter; labelKey: 'all' | 'self' | 'hand' | 'auto' }[] = [
  { value: 'all', labelKey: 'all' },
  { value: 'self', labelKey: 'self' },
  { value: 'hand', labelKey: 'hand' },
  { value: 'auto', labelKey: 'auto' },
];

export function FilterBar() {
  const t = useTranslations('map.filterBar');
  const tCarwashFilter = useTranslations('map.carwashFilter');
  const productLabel = useProductLabel();
  // 세차 가능(carwashOnly)은 BrandFilter 드롭다운으로 옮겨 여기선 다루지 않는다.
  const { product, setProduct, layer, setLayer, carwashType, setCarwashType } = useMapStore();
  // 열려 있는 드롭다운('gas'=유종 | 'carwash'=세차장 유형 | null)
  const [openMenu, setOpenMenu] = useState<null | 'gas' | 'carwash'>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const isGas = layer === 'gas';
  const isCarwash = layer === 'carwash';

  // 레이어 버튼 클릭 — 다른 레이어면 전환, 이미 그 레이어면 드롭다운 토글.
  // '주유소' 복귀 시 유종은 유지한다(setProduct 호출 안 함 — B027로 강제 되돌리지 않는다).
  const onLayerClick = (value: MapLayer) => {
    if (layer !== value) {
      setLayer(value);
      // 하위 선택지가 있는 레이어는 전환과 동시에 열어 준다(주유소=유종, 세차장=유형).
      setOpenMenu(value === 'gas' ? 'gas' : value === 'carwash' ? 'carwash' : null);
      return;
    }
    if (value === 'ev') return; // EV는 하위 선택지 없음
    setOpenMenu((v) => (v === value ? null : (value as 'gas' | 'carwash')));
  };

  // 바깥 클릭 / ESC로 닫기
  useEffect(() => {
    if (!openMenu) return;
    function onDown(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  return (
    <div
      ref={barRef}
      className="relative flex items-center gap-1.5 border-b border-gray-100 bg-white px-3 py-1.5 dark:border-gray-800 dark:bg-gray-900"
    >
      {/* 레이어 전환 세그먼트 — 내용폭(flex-1 없음)이라 넓은 화면에서 늘어나지 않는다. */}
      {/* radio 롤은 쓰지 않는다 — 주유소/세차장 버튼이 메뉴 트리거를 겸해(aria-haspopup)
          radio 가 지원하지 않는 속성이 필요하다. 활성 표시는 aria-pressed 로 한다. */}
      <div
        role="group"
        aria-label={t('layerGroupAria')}
        // 레이어가 4개가 되면서 360·375px 에서 폭이 모자란다. shrink-0 을 유지하면 오른쪽
        // '브랜드' 버튼이 화면 밖으로 밀려나 **누를 수 없게** 된다(가로 스크롤이 없어서).
        // 그래서 이 그룹만 줄어들 수 있게 하고 내부를 가로 스크롤시킨다 — 라벨은 그대로 두고
        // 브랜드는 항상 화면에 남는다. 드롭다운 메뉴는 이 그룹 밖(필터바 직속)이라 잘리지 않는다.
        className="scrollbar-none relative z-20 flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full bg-gray-100 p-0.5 dark:bg-gray-800"
      >
        {LAYER_OPTIONS.map(({ value, labelKey, Icon }) => {
          const active = layer === value;
          const label = t(labelKey);
          // 하위 선택지가 있는 레이어(주유소/세차장)만 ▾ 를 달고 메뉴를 연다.
          const hasMenu = value === 'gas' || value === 'carwash';
          // 활성 상태에선 현재 하위 선택을 노출한다(드롭다운을 열어보지 않아도 보이게).
          // 주유소는 '주유소 · 휘발유' 대신 유종만 노출한다 — 연료 아이콘 + 활성색이 이미
          // 주유소 레이어임을 말해 주므로 레이어명은 중복이고, 폭도 그만큼 줄어든다.
          const sub =
            active && value === 'carwash' && carwashType !== 'all'
              ? tCarwashFilter(CARWASH_TYPE_OPTIONS.find((o) => o.value === carwashType)!.labelKey)
              : null;
          const text = active && value === 'gas' ? productLabel(product) : label;
          return (
            <button
              key={value}
              aria-pressed={active}
              aria-haspopup={hasMenu ? 'menu' : undefined}
              aria-expanded={hasMenu ? openMenu === value : undefined}
              // 화면에서 '주유소'를 뺀 만큼 스크린리더에는 레이어명을 유지한다(예: "주유소 지도, 휘발유").
              aria-label={`${t('layerAria', { label })}${active && value === 'gas' ? `, ${productLabel(product)}` : ''}`}
              onClick={() => onLayerClick(value)}
              className={clsx(
                'flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition',
                active
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-gray-700',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {/* 레이어 라벨은 폭에 관계없이 항상 노출한다 — 390px 실측에서 3개 다 켜도
                  우측 '브랜드'가 잘리지 않는다(넘치는 건 '세차 가능' 쪽 스크롤 컨테이너가 흡수). */}
              <span>{text}</span>
              {sub && <span className="font-medium opacity-80">· {sub}</span>}
              {hasMenu && (
                <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              )}
            </button>
          );
        })}

      </div>

      {/* 드롭다운 메뉴는 레이어 그룹 "밖"에 둔다 — 그룹에 overflow-x-auto(가로 스크롤)가
          걸려 있어서, 안에 두면 absolute 메뉴가 그 스크롤 컨테이너에 잘려 아예 안 보인다
          (overflow-x:auto 는 overflow-y 도 auto 로 계산되므로 아래로 펼쳐지는 메뉴가 잘린다).
          위치 기준은 필터바(relative)다. */}
      {/* 유종 드롭다운 — 주유소 버튼 아래. 휘발유/경유/고급휘발유/LPG 한 단계로 노출. */}
      {openMenu === 'gas' && (
        <div
          role="menu"
          aria-label={t('fuelMenuAria')}
          className="absolute left-3 top-[46px] z-50 w-36 rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {FUEL_OPTIONS.map((p) => {
            const active = isGas && product === p;
            return (
              <button
                key={p}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setProduct(p);
                  setOpenMenu(null);
                }}
                className={clsx(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {productLabel(p)}
                {active && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 세차장 유형 드롭다운 — 세차장 버튼 아래(2행을 없앤 대신 여기로 들어옴). */}
      {openMenu === 'carwash' && (
        <div
          role="menu"
          aria-label={t('carwashMenuAria')}
          className="absolute right-3 top-[46px] z-50 w-32 rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {CARWASH_TYPE_OPTIONS.map((opt) => {
            const active = carwashType === opt.value;
            return (
              <button
                key={opt.value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setCarwashType(opt.value);
                  setOpenMenu(null);
                }}
                className={clsx(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {tCarwashFilter(opt.labelKey)}
                {active && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 주유소 레이어 부가 필터 — 브랜드 + 세차 가능(둘 다 BrandFilter 드롭다운 안). 우측 끝에 고정. */}
      {isGas && (
        <div className="ml-auto shrink-0">
          <BrandFilter />
        </div>
      )}

      {/* isCarwash 부가 필터는 세차장 드롭다운으로 흡수. ev 레이어는 부가 필터 없음. */}
    </div>
  );
}
