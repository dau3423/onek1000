'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { useMapStore, type MapLayer } from '@/stores/map';
import { type ProductCode } from '@/types/station';
import type { CarwashTypeFilter } from '@/types/carwash';
import { useProductLabel } from '@/lib/i18n/labels';
import { BrandFilter } from './BrandFilter';
import { BoltIcon, CarwashIcon, WrenchIcon, FuelIcon, CarIcon } from '@/components/icons';
import { REPAIR_BRAND_ORDER } from '@/types/repair';
import type { RentalFilter } from '@/types/rental';
import { track } from '@/lib/analytics';
import clsx from 'clsx';

// 주유소 드롭다운에 나열할 유종. 기존엔 '휘발유▾' 드롭다운(일반/고급)과 경유·LPG 칩이 따로
// 있어 유종 선택이 두 군데로 갈렸다. 이제 주유소 버튼 하나가 드롭다운을 열고 여기서 전부 고른다.
const FUEL_OPTIONS: ProductCode[] = ['B027', 'D047', 'B034', 'C004'];

// 레이어 전환 — 주유소/EV/세차장/정비소/렌터카. 하위 선택지가 있는 레이어는 드롭다운 트리거를 겸한다.
type LayerLabelKey = 'layerGas' | 'layerEv' | 'layerCarwash' | 'layerRepair' | 'layerRental';
const LAYER_OPTIONS: { value: MapLayer; labelKey: LayerLabelKey; Icon: ComponentType<{ className?: string }> }[] = [
  { value: 'gas', labelKey: 'layerGas', Icon: FuelIcon },
  { value: 'ev', labelKey: 'layerEv', Icon: BoltIcon },
  { value: 'carwash', labelKey: 'layerCarwash', Icon: CarwashIcon },
  { value: 'repair', labelKey: 'layerRepair', Icon: WrenchIcon },
  { value: 'rental', labelKey: 'layerRental', Icon: CarIcon },
];

// 렌터카 레이어 필터. 'ev'=전기차 보유 업체만(원천에 전기승용/전기승합 보유대수가 있어 정확히 갈린다).
const RENTAL_FILTER_OPTIONS: { value: RentalFilter; labelKey: 'all' | 'ev' }[] = [
  { value: 'all', labelKey: 'all' },
  { value: 'ev', labelKey: 'ev' },
];

/** 하위 선택지(드롭다운)를 가진 레이어. EV 만 없다.
 *  같은 판정이 세 군데(전환 시 자동 열기 / ▾ 표시 / 토글)에 쓰여 한 곳으로 모았다 —
 *  레이어를 추가할 때 한 군데만 고쳐 놓고 나머지를 빠뜨리는 사고를 막는다. */
const HAS_MENU = new Set<MapLayer>(['gas', 'carwash', 'repair', 'rental']);

/**
 * 슬롯별 표시 브레이크포인트 — 좁은 화면에서 뒤쪽 슬롯을 감추고 '+N' 으로 넘긴다.
 *
 * 폭을 **측정하지 않고 CSS 로 결정**한다. ResizeObserver 로 재면 SSR 첫 페인트에서 깜빡이고
 * 테스트도 어렵다. JS 는 "어떤 레이어가 몇 번 슬롯인가"만 정하고(활성 기준), 실제 노출은
 * 여기 박힌 클래스가 화면 폭으로 판단한다.
 *
 * 실측 근거(2026-08-24, 프로덕션): 레이어 5개 내용폭 406px 인데 가시폭은 390px 기기에서 307px,
 * 430px 기기에서도 347px 이라 **어떤 폰에서도 5개가 다 들어가지 않는다**. 여백·폰트를 줄여도
 * 334px 로 여전히 넘친다 — 그래서 '조금 줄이기'가 아니라 오버플로 구조로 바꿨다.
 */
const SLOT_VISIBILITY = [
  'flex',                        // 0 — 주유소(고정)
  'flex',                        // 1 — EV(고정)
  'flex',                        // 2 — **활성 자리라 항상 노출**(orderLayers 주석 참고)
  'hidden min-[460px]:flex',     // 3
  'hidden min-[560px]:flex',     // 4
];

/**
 * 표시 순서를 정한다 — **주유소·EV 는 항상 앞 두 자리**, 세 번째는 활성 레이어가 차지한다.
 *
 *   주유소 활성 → [휘발유▾] [EV] [세차장]   +2
 *   세차장 활성 → [주유소]  [EV] [세차장▾]  +2
 *   정비소 활성 → [주유소]  [EV] [정비소▾]  +2
 *   렌터카 활성 → [주유소]  [EV] [렌터카▾]  +2
 *
 * 앞 두 자리를 고정하는 이유: 사용 빈도가 가장 높은 둘이고, 자리가 고정돼야 위치를 손이 기억한다.
 * 활성이 세 번째로 오므로 **슬롯 2까지는 반드시 노출돼야 한다**(SLOT_VISIBILITY 참고) —
 * 안 그러면 좁은 화면에서 "선택했는데 화면에서 사라지는" 상태가 된다.
 * 활성이 주유소/EV 면 세 번째는 세차장이 채운다(원래 우선순위 다음 순서).
 */
function orderLayers(active: MapLayer): typeof LAYER_OPTIONS {
  const pinned = LAYER_OPTIONS.slice(0, 2);          // 주유소, EV
  const rest = LAYER_OPTIONS.slice(2);               // 세차장, 정비소, 렌터카
  const third = pinned.some((o) => o.value === active)
    ? rest[0]                                        // 활성이 고정석이면 세차장이 세 번째
    : (rest.find((o) => o.value === active) ?? rest[0]);
  return [...pinned, third, ...rest.filter((o) => o !== third)];
}

/** 본 적 있는 레이어 집합(localStorage) — '+N' 에 NEW 점을 띄울지 판정한다. */
const SEEN_LAYERS_KEY = 'onek_seen_layers';

function readSeenLayers(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_LAYERS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();   // localStorage 불가 환경 — NEW 점만 안 뜨고 나머지는 정상 동작
  }
}

function writeSeenLayers(s: Set<string>): void {
  try {
    localStorage.setItem(SEEN_LAYERS_KEY, JSON.stringify([...s]));
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 메뉴 폭(px) — 트리거 아래 정렬 시 오른쪽 클램프 계산에 쓴다. 아래 각 메뉴의 w-* 와 맞춘다. */
const MENU_WIDTH: Record<MapLayer | 'more', number> = {
  gas: 144,       // w-36
  carwash: 128,   // w-32
  repair: 160,    // w-40
  rental: 144,    // w-36
  ev: 0,          // 메뉴 없음
  more: 208,      // w-52
};

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
  const tRepairBrand = useTranslations('repair.brandLabel');
  const tRentalFilter = useTranslations('map.rentalFilter');
  const productLabel = useProductLabel();
  // 세차 가능(carwashOnly)은 BrandFilter 드롭다운으로 옮겨 여기선 다루지 않는다.
  const { product, setProduct, layer, setLayer, carwashType, setCarwashType, repairBrand, setRepairBrand, rentalFilter, setRentalFilter } = useMapStore();
  // 열려 있는 드롭다운('gas'=유종 | 'carwash'=세차장 유형 | null)
  /** 하위 선택지를 가진 레이어만 메뉴를 연다(EV 는 없음). */
  type MenuKey = 'gas' | 'carwash' | 'repair' | 'rental' | 'more';
  const [openMenu, setOpenMenu] = useState<null | MenuKey>(null);
  const barRef = useRef<HTMLDivElement>(null);
  /** 열린 메뉴를 트리거 버튼 아래에 맞추기 위한 x 좌표(px, 필터바 기준). */
  const [menuLeft, setMenuLeft] = useState(12);

  const isGas = layer === 'gas';
  const isCarwash = layer === 'carwash';
  const isRepair = layer === 'repair';

  // 표시 순서 — 활성이 항상 앞 두 슬롯에 오도록 재배치한다(위 orderLayers 주석 참고).
  const ordered = orderLayers(layer);

  // 아직 열어보지 않은 레이어가 있으면 '+N' 에 NEW 점을 띄운다.
  // 마운트 후에만 읽는다 — localStorage 는 서버에 없어서 SSR 결과와 어긋나면 hydration 이 깨진다.
  const [hasUnseen, setHasUnseen] = useState(false);
  useEffect(() => {
    const seen = readSeenLayers();
    setHasUnseen(LAYER_OPTIONS.some((o) => !seen.has(o.value)));
  }, []);

  /** '+N' 메뉴를 열면 전체 레이어를 본 것으로 기록한다(그 메뉴가 전부를 나열하므로). */
  const markAllSeen = () => {
    writeSeenLayers(new Set(LAYER_OPTIONS.map((o) => o.value)));
    setHasUnseen(false);
  };

  /** 트리거 버튼 기준으로 메뉴 x 좌표를 잡는다. 메뉴는 그룹 밖에 있어 스스로 정렬하지 못한다. */
  const anchorMenu = (el: HTMLElement | null, menuWidth: number) => {
    const bar = barRef.current;
    if (!el || !bar) return;
    const left = el.getBoundingClientRect().left - bar.getBoundingClientRect().left;
    // 오른쪽으로 넘치지 않게 클램프. 좌우 12px 는 필터바의 px-3 여백과 맞춘다.
    setMenuLeft(Math.max(12, Math.min(left, bar.clientWidth - menuWidth - 12)));
  };

  // 레이어가 바뀌면 슬롯이 재배치되므로(orderLayers) 열린 메뉴의 앵커를 **렌더 후** 다시 잡는다.
  // useLayoutEffect 인 이유: 페인트 전에 위치를 확정해야 메뉴가 옛 자리에 한 프레임 그려졌다가
  // 튀는 것을 막는다. '+N' 메뉴는 자기 버튼이 안 움직이므로 제외한다.
  useLayoutEffect(() => {
    if (!openMenu || openMenu === 'more') return;
    const bar = barRef.current;
    if (!bar) return;
    const btn = bar.querySelector<HTMLElement>('[role="group"] [aria-pressed="true"]');
    if (btn) anchorMenu(btn, MENU_WIDTH[layer]);
    // anchorMenu 는 렌더마다 새로 만들어지지만 barRef 만 읽어 안정적이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, openMenu]);

  // 레이어 버튼 클릭 — 다른 레이어면 전환, 이미 그 레이어면 드롭다운 토글.
  // '주유소' 복귀 시 유종은 유지한다(setProduct 호출 안 함 — B027로 강제 되돌리지 않는다).
  const onLayerClick = (value: MapLayer, el?: HTMLElement | null) => {
    if (layer !== value) {
      setLayer(value);
      // 하위 선택지가 있는 레이어는 전환과 동시에 열어 준다(주유소=유종, 세차장=유형).
      // 앵커는 여기서 잡지 않는다 — 전환되면 슬롯이 재배치돼(orderLayers) 이 버튼이 다른
      // 자리로 옮겨가므로 지금 좌표는 곧 틀린 값이 된다(실측: 세차장에서 55px 어긋났다).
      // 렌더가 끝난 뒤 아래 useLayoutEffect 가 활성 버튼 기준으로 다시 잡는다.
      setOpenMenu(HAS_MENU.has(value) ? (value as MenuKey) : null);
      return;
    }
    if (value === 'ev') return; // EV는 하위 선택지 없음
    anchorMenu(el ?? null, MENU_WIDTH[value]);
    setOpenMenu((v) => (v === value ? null : (value as MenuKey)));
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
      className="relative flex items-center gap-1.5 border-b border-gray-100 bg-white px-2.5 py-2 dark:border-gray-800 dark:bg-gray-900"
    >
      {/* 레이어 전환 세그먼트 — 내용폭(flex-1 없음)이라 넓은 화면에서 늘어나지 않는다. */}
      {/* radio 롤은 쓰지 않는다 — 주유소/세차장 버튼이 메뉴 트리거를 겸해(aria-haspopup)
          radio 가 지원하지 않는 속성이 필요하다. 활성 표시는 aria-pressed 로 한다. */}
      <div
        role="group"
        aria-label={t('layerGroupAria')}
        // 레이어가 5개가 되면서 **어떤 폰 폭에서도** 전부 들어가지 않는다(실측: 내용 406px vs
        // 430px 기기 가시폭 347px). 예전에는 가로 스크롤로 넘겼는데, 세그먼트 트랙은
        // "여기 있는 게 전부"라고 약속하는 컴포넌트라 오른쪽 모서리가 화면 밖에 있으면
        // 잘림 단서가 없어 **렌더링 버그로 읽힌다**(실제 사용자 지적). 게다가 활성 항목이
        // 잘리는 경우까지 생겼다.
        // → 지금은 뒤쪽 슬롯을 감추고 '+N' 으로 넘긴다(SLOT_VISIBILITY). overflow-x-auto 는
        //   안전망으로만 남긴다 — 평상시엔 발동하지 않는다.
        // gap-0: 320px 에서 3개+더보기가 6px 모자랐다(실측). 세그먼트는 버튼 사이가 붙어도
        // 활성 배경색으로 충분히 갈라지므로, 좁은 화면에서만 간격을 0 으로 둔다.
        className="scrollbar-none relative z-20 flex min-w-0 shrink items-center gap-0 overflow-x-auto rounded-full bg-gray-100 p-0.5 min-[360px]:gap-0.5 dark:bg-gray-800"
      >
        {ordered.map(({ value, labelKey, Icon }, slot) => {
          const active = layer === value;
          const label = t(labelKey);
          const hasMenu = HAS_MENU.has(value);
          // 활성 상태에선 현재 하위 선택을 노출한다(드롭다운을 열어보지 않아도 보이게).
          // 레이어명 대신 **하위값만** 쓴다 — 아이콘 + 활성색이 이미 어떤 레이어인지 말하므로
          // '정비소 · 블루핸즈'(142px)는 중복이고, '블루핸즈'(91px)면 충분하다.
          const sub =
            active && value === 'carwash' && carwashType !== 'all'
              ? tCarwashFilter(CARWASH_TYPE_OPTIONS.find((o) => o.value === carwashType)!.labelKey)
              : active && value === 'repair' && repairBrand !== 'all'
                ? tRepairBrand(repairBrand)
                : active && value === 'rental' && rentalFilter !== 'all'
                  ? tRentalFilter(rentalFilter)
                  : active && value === 'gas'
                    ? productLabel(product)
                    : null;
          return (
            <button
              key={value}
              aria-pressed={active}
              aria-haspopup={hasMenu ? 'menu' : undefined}
              aria-expanded={hasMenu ? openMenu === value : undefined}
              // 화면에서 레이어명을 뺀 만큼 스크린리더에는 유지한다(예: "정비소 지도, 블루핸즈").
              aria-label={`${t('layerAria', { label })}${sub ? `, ${sub}` : ''}`}
              onClick={(e) => onLayerClick(value, e.currentTarget)}
              className={clsx(
                // h-9 + 바의 py-2 로 실효 히트 영역 44px 를 확보한다(기존 h-8/py-1.5 보다 큼).
                // px-2: 320px 에서 3개+더보기+브랜드가 들어가려면 16px 이 모자랐다(실측).
                // 세로(h-9)는 그대로라 터치 영역 44px 는 유지된다.
                // 400px 미만에서 px-1.5: ja/en 은 라벨이 길어 기본 상태에서도 트랙이 넘쳤다
                // (실측 ja@360 10px, en@320 19px 초과). 좌우 2px 씩 × 버튼 4개 = 16px 을 되찾는다.
                'h-9 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs font-semibold transition min-[400px]:px-2',
                'min-w-0',   // 아래 라벨 truncate 가 flex 안에서 먹히려면 필요하다
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'focus-visible:ring-offset-1 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-gray-800',
                SLOT_VISIBILITY[slot] ?? 'hidden',
                active
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-gray-700',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {/* 하위값(sub)은 길이를 통제할 수 없다 — 로케일 무관하게 트랙을 깨뜨리는 주범이다.
                  실측 최장: ko '쌍용 · KG모빌리티'(11자), en 'Vehicle inspection'(18자),
                  'Premium Gasoline'(16자), zh '现代 Bluehands'(12자).
                  상한을 두면 긴 값만 말줄임되고 트랙 전체가 밀리지 않는다. 흔한 값
                  (ko '고급휘발유' 약 60px)은 상한 안이라 그대로 다 보인다. */}
              <span className="max-w-[4.5rem] truncate min-[390px]:max-w-[7rem]">{sub ?? label}</span>
              {/* ▾ 는 **활성 버튼에만** 단다. 비활성에 붙이면 "메뉴가 열린다"고 말하지만 실제
                  첫 탭은 레이어 전환이라 거짓 신호이고, 버튼당 14px 씩 폭만 먹는다. */}
              {hasMenu && active && (
                <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              )}
            </button>
          );
        })}

        {/* 넘친 레이어 개수를 **숫자로 명시**한다. 잘린 픽셀은 아무것도 약속하지 않지만
            '+2' 는 "2개 더 있다"를 학습 없이 읽히게 한다 — 새 레이어 발견성의 핵심.
            560px 이상에서는 5개가 다 보이므로 이 버튼 자체를 숨긴다. */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'more'}
          aria-label={t('moreLayersAria')}
          onClick={(e) => {
            anchorMenu(e.currentTarget, MENU_WIDTH.more);
            setOpenMenu((v) => (v === 'more' ? null : 'more'));
            markAllSeen();
            track('layer_more_open');
          }}
          className={clsx(
            'flex h-9 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-bold tabular-nums transition',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'focus-visible:ring-offset-1 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-gray-800',
            'text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-gray-700',
            'min-[560px]:hidden',
          )}
        >
          {/* 숨겨진 개수는 화면 폭마다 다르다. aria-label 에는 숫자를 넣지 않아
              반응형 불일치(스크린리더가 틀린 수를 읽는 것)를 원천 차단한다. */}
          {/* 슬롯 2 까지 항상 보이므로 최소 노출이 3개다 → 숨는 수는 2 또는 1. */}
          <span aria-hidden className="min-[460px]:hidden">+2</span>
          <span aria-hidden className="hidden min-[460px]:inline">+1</span>
          {hasUnseen && (
            <>
              {/* 색만으로 의미를 전달하지 않는다 — sr-only 텍스트를 반드시 병기한다. */}
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500 dark:bg-rose-400" aria-hidden />
              <span className="sr-only">{t('newLayerBadge')}</span>
            </>
          )}
        </button>
      </div>

      {/* 드롭다운 메뉴는 레이어 그룹 "밖"에 둔다 — 그룹에 overflow-x-auto 가 걸려 있어서,
          안에 두면 absolute 메뉴가 그 스크롤 컨테이너에 잘려 아예 안 보인다
          (overflow-x:auto 는 overflow-y 도 auto 로 계산되므로 아래로 펼쳐지는 메뉴가 잘린다).
          대신 그룹 밖이라 스스로 트리거를 따라가지 못하므로, 클릭 시 잰 x 좌표(menuLeft)를
          넘겨 버튼 아래에 맞춘다 — 예전에는 left-3/right-3 고정이라 가운데 있는 세차장을 눌러도
          메뉴가 화면 오른쪽 끝에서 열렸다. 위치 기준은 필터바(relative)다. */}
      {/* 유종 드롭다운 — 주유소 버튼 아래. 휘발유/경유/고급휘발유/LPG 한 단계로 노출. */}
      {openMenu === 'gas' && (
        <div
          role="menu"
          aria-label={t('fuelMenuAria')}
          style={{ left: menuLeft }}
          className="absolute top-[50px] z-50 w-36 rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
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
          style={{ left: menuLeft }}
          className="absolute top-[50px] z-50 w-32 rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
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

      {/* 정비소 브랜드 드롭다운 — 오토큐·블루핸즈를 맨 위에 굵게(가장 많이 쓰는 두 곳).
          목록이 11개라 다른 메뉴보다 길어, 최대 높이를 두고 넘치면 세로 스크롤한다. */}
      {openMenu === 'repair' && (
        <div
          role="menu"
          aria-label={t('repairMenuAria')}
          style={{ left: menuLeft }}
          className="scrollbar-none absolute top-[50px] z-50 max-h-[60vh] w-40 overflow-y-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {REPAIR_BRAND_ORDER.map(({ value, emphasis }) => {
            const active = repairBrand === value;
            return (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setRepairBrand(value);
                  setOpenMenu(null);
                }}
                className={clsx(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition',
                  emphasis ? 'font-extrabold' : 'font-semibold',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {tRepairBrand(value)}
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

      {/* 렌터카 필터 드롭다운 — 전체 / 전기차 보유. 항목이 둘뿐이라 폭을 좁게 잡는다. */}
      {openMenu === 'rental' && (
        <div
          role="menu"
          aria-label={t('rentalMenuAria')}
          style={{ left: menuLeft }}
          className="absolute top-[50px] z-50 w-36 rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {RENTAL_FILTER_OPTIONS.map((opt) => {
            const active = rentalFilter === opt.value;
            return (
              <button
                key={opt.value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setRentalFilter(opt.value);
                  setOpenMenu(null);
                }}
                className={clsx(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {tRentalFilter(opt.labelKey)}
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

      {/* '+N' 메뉴 — **숨겨진 것만이 아니라 전체 레이어**를 나열한다.
          그래야 이 메뉴가 "앱이 제공하는 지도 전체 목록"이 되고, 한 번 열어본 사용자는
          렌터카를 포함한 전부를 알게 된다(새 레이어 발견성이 이 화면의 목적).
          목록은 LAYER_OPTIONS 를 그대로 순회한다 — 레이어를 추가할 때 여기를 따로 고칠 일이 없다. */}
      {openMenu === 'more' && (
        <div
          role="menu"
          aria-label={t('moreLayersAria')}
          style={{ left: menuLeft }}
          className="absolute top-[50px] z-50 w-52 rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {LAYER_OPTIONS.map(({ value, labelKey, Icon }) => {
            const active = layer === value;
            // 현재 하위 선택을 보조 텍스트로 함께 보여준다 — 어떤 상태인지 열어보지 않아도 알 수 있다.
            const sub =
              value === 'gas'
                ? productLabel(product)
                : value === 'carwash' && carwashType !== 'all'
                  ? tCarwashFilter(CARWASH_TYPE_OPTIONS.find((o) => o.value === carwashType)!.labelKey)
                  : value === 'repair' && repairBrand !== 'all'
                    ? tRepairBrand(repairBrand)
                    : value === 'rental' && rentalFilter !== 'all'
                      ? tRentalFilter(rentalFilter)
                      : null;
            return (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  // 기존 onLayerClick 과 같은 흐름을 타되, 메뉴 위치는 '+N' 기준을 유지한다.
                  if (layer !== value) {
                    setLayer(value);
                    track('layer_select_from_more', { layer: value });
                    setOpenMenu(HAS_MENU.has(value) ? (value as MenuKey) : null);
                  } else {
                    setOpenMenu(null);
                  }
                }}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-xs font-semibold transition',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t(labelKey)}</span>
                {sub && (
                  <span className="shrink-0 text-[11px] font-medium text-gray-400 dark:text-gray-500">{sub}</span>
                )}
                {active && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4}>
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
