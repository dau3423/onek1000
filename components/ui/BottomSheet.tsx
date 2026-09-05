'use client';

import type { MapLayer } from '@/stores/map';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { track } from '@/lib/analytics';
import type { StationWithPrice } from '@/types/station';
import { BRAND_COLOR } from '@/types/station';
import { useBrandLabel } from '@/lib/i18n/labels';
import { priceTier, priceTierThresholds, distanceMeters } from '@/lib/map/geo';
import type { EvStationMarker } from '@/types/ev';
import { rankEvStations, type EvStationRanked, type EvSortOrigin } from '@/lib/ev/sort';
import type { CarwashMarker } from '@/types/carwash';
import type { RepairMarker } from '@/types/repair';
import type { ParkingMarker } from '@/types/parking';
import { toFeeKindCode, toLotKindCode } from '@/lib/parking/labels';
import type { RentalMarker } from '@/types/rental';
import { primaryFee, RENTAL_COLOR, RENTAL_EV_COLOR } from '@/types/rental';
import { REPAIR_BRAND_COLOR, REPAIR_TYPE_COLOR } from '@/types/repair';
import { WASH_TYPE_COLOR } from '@/types/carwash';
import { CarwashTypeBadge } from '@/components/carwash/CarwashTypeBadge';
import { RepairTypeBadge } from '@/components/repair/RepairTypeBadge';
import { RepairBrandBadge } from '@/components/repair/RepairBrandBadge';
import { CrownIcon, ChevronRightIcon, BoltFilledIcon, DropletIcon } from '@/components/icons';

type Tab = 'area' | 'nearby';

/**
 * 바텀시트 레이아웃 상수 (단일 출처).
 * GPS 버튼 등 시트와 연동되는 요소가 동일 값을 참조해 겹침/오정렬을 방지한다.
 */
/** 접힘 상태에서 노출되는 손잡이/탭 영역 높이(px). 헤더(~48) + 탭(~34) + 탭 아래 여백(~14) */
export const SHEET_PEEK_PX = 96;
/** 펼침 상태의 시트 높이(뷰포트 비율) */
export const SHEET_OPEN_VH = 70;
/**
 * 시트를 끌기 시작할 최소 이동량(px). 브라우저 탭 슬롭(약 10px)보다 커야
 * 목록 항목을 누르려던 손가락이 시트를 움직이지 않는다.
 */
const DRAG_SLOP_PX = 12;
/** 이 속도(px/ms, 위로 양수)를 넘으면 위치와 무관하게 방향대로 스냅한다(플링). */
const FLING_VELOCITY = 0.4;
/** 스냅 애니메이션 시간(ms). 클래스의 duration-300 과 맞춘다. */
const SNAP_MS = 300;
/** 스와이프 직후 따라오는 합성 click 을 무시하는 시간(ms). 스와이프가 곧바로 되돌려지는 것을 막는다. */
const CLICK_SUPPRESS_MS = 400;

interface Props {
  stations: StationWithPrice[];
  onSelect: (s: StationWithPrice) => void;
  /** 내 GPS 반경 내 최저가(거리 포함). geo 활성화 시에만 채워짐 */
  nearbyStations?: StationWithPrice[];
  /** 반경 조회 활성화 여부 (내 위치 권한 동의 후) */
  nearbyEnabled?: boolean;
  /**
   * 전국 최저가 TOP10 id→순위(1~10) 맵. 목록에 이 주유소가 보이면 "반짝이는 황금색"으로
   * 강조하고 '전국 N위' 배지를 단다(전국 TOP10 마커와 동일한 골드 톤으로 연계).
   */
  nationalTop10Rank?: Map<string, number>;
  /** 반경(m) — '내 주변' 탭 라벨 표시용 */
  nearbyRadiusM?: number;
  /** 특정 주유소로 길안내(카카오내비) 시작 요청 */
  onNavigate?: (s: StationWithPrice) => void;
  /** 열림/접힘 상태 변화 통지 (부모가 GPS 버튼 위치 등을 연동) */
  onOpenChange?: (open: boolean) => void;
  /**
   * 세차 필터(FR-1) 활성 여부. true면 타이틀/빈 상태 문구를 세차 문맥으로 전환한다.
   * 목록 필터 자체는 서버(carwash=1)에서 이미 적용되어 stations/nearbyStations에 반영된다.
   */
  carwashOnly?: boolean;
  /** 주차장 '무료만' 필터 — 빈 상태 문구를 가르는 데 쓴다. */
  parkingFree?: boolean;
  /** 세차 빈 상태 탈출구 — "세차 필터 끄기" 탭 시 호출(carwashOnly를 끈다). */
  onDisableCarwash?: () => void;
  /**
   * 외부에서 시트를 여는 신호(홈 CarwashDayCard CTA 딥링크용). 값이 바뀌면(증가) 시트를
   * 펼치고 onOpenChange(true)를 통지한다. 내부 open 상태가 외부에서 열 수 없는 문제를 최소 침습으로 해결.
   */
  openSignal?: number;
  /**
   * 활성 탭 변화 통지 (부모가 지도 마커 숫자 표시 집합을 연동).
   * 실제 활성 탭은 nearbyEnabled 여부를 반영한 값(area/nearby)을 전달한다.
   */
  onTabChange?: (tab: Tab) => void;

  // === 전기차 충전소(EV) 레이어 ===
  /** 현재 지도 레이어. 'ev'면 충전소, 'carwash'면 세차장 목록을 표시한다. 기본 'gas'. */
  layer?: MapLayer;
  /** 화면 영역 내 충전소 마커 목록(layer='ev'일 때 사용). */
  evStations?: EvStationMarker[];
  /**
   * 충전소 정렬/거리 계산 기준 좌표(내 위치 우선, 없으면 화면 중심). null이면 거리 미표시.
   * 충전소엔 단가가 없으므로 정렬은 사용가능→급속→거리 순(lib/ev/sort).
   */
  evOrigin?: EvSortOrigin | null;
  /** 충전소 선택 콜백(상세 이동). */
  onSelectEv?: (s: EvStationMarker) => void;
  /** 충전소 길안내 콜백. */
  onNavigateEv?: (s: EvStationMarker) => void;

  // === 독립 세차장(carwash) 레이어 ===
  /** 화면 영역 내 세차장 마커 목록(layer='carwash'일 때 사용, 유형 필터 적용 후 집합). */
  carwashPlaces?: CarwashMarker[];
  /** 정비소 목록(layer='repair'). */
  repairShops?: RepairMarker[];
  /** 렌터카 목록(layer='rental'). */
  rentalPlaces?: RentalMarker[];
  parkingPlaces?: ParkingMarker[];
  /**
   * 세차장 거리 계산/정렬 기준 좌표(내 위치 우선, 없으면 화면 중심). null이면 거리 미표시.
   * 세차장엔 가격이 없으므로 정렬은 거리순(좌표 있을 때)만 적용한다.
   */
  carwashOrigin?: { lat: number; lng: number } | null;
  /** 정비소 거리 계산 기준 좌표(내 위치 → 지도 중심 폴백). */
  repairOrigin?: { lat: number; lng: number } | null;
  rentalOrigin?: { lat: number; lng: number } | null;
  parkingOrigin?: { lat: number; lng: number } | null;
  /** 세차장 선택 콜백(상세 이동). */
  onSelectCarwash?: (p: CarwashMarker) => void;
  onSelectRepair?: (p: RepairMarker) => void;
  onSelectRental?: (p: RentalMarker) => void;
  onSelectParking?: (p: ParkingMarker) => void;
  onNavigateParking?: (p: ParkingMarker) => void;
  /** 세차장 길안내 콜백. */
  onNavigateCarwash?: (p: CarwashMarker) => void;
  onNavigateRepair?: (p: RepairMarker) => void;
  onNavigateRental?: (p: RentalMarker) => void;
}

const NEARBY_LIMIT = 10;
const AREA_LIMIT = 30;
// EV 레이어 목록 상한. 충전소는 밀도가 높아 과도 렌더 방지(정렬은 가져온 집합 내에서).
const EV_LIMIT = 50;
// 세차장 레이어 목록 상한(EV와 동일 취지).
const CARWASH_LIMIT = 50;
const REPAIR_LIMIT = 50;
const RENTAL_LIMIT = 50;

/** 세차장 목록 1행 표시용(거리 계산 결과 동봉). */
interface RentalRanked {
  place: RentalMarker;
  distance: number | null;
}

interface RepairRanked {
  shop: RepairMarker;
  distance: number | null;
}

interface CarwashRanked {
  place: CarwashMarker;
  distance: number | null;
}

export function BottomSheet({
  stations,
  onSelect,
  nearbyStations = [],
  nationalTop10Rank,
  nearbyEnabled = false,
  nearbyRadiusM = 10000,
  onNavigate,
  onOpenChange,
  onTabChange,
  carwashOnly = false,
  parkingFree = false,
  onDisableCarwash,
  openSignal,
  layer = 'gas',
  evStations = [],
  evOrigin = null,
  onSelectEv,
  onNavigateEv,
  carwashPlaces = [],
  repairShops = [],
  rentalPlaces = [],
  parkingPlaces = [],
  carwashOrigin = null,
  repairOrigin = null,
  rentalOrigin = null,
  parkingOrigin = null,
  onSelectCarwash,
  onSelectRepair,
  onSelectRental,
  onSelectParking,
  onNavigateParking,
  onNavigateCarwash,
  onNavigateRepair,
  onNavigateRental,
}: Props) {
  const t = useTranslations('map');
  const brandLabel = useBrandLabel();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('area');

  // 외부 열기 신호(딥링크): openSignal 이 바뀌면(증가) 시트를 펼치고 상태를 부모에 통지한다.
  // 마운트 시엔 초기값과 같아 발화하지 않는다(증가분에만 반응).
  const openSignalRef = useRef(openSignal);
  useEffect(() => {
    if (openSignal === openSignalRef.current) return;
    openSignalRef.current = openSignal;
    // 여기서는 sheet_open 을 남기지 않는다 — 이 경로는 홈 세차 카드 CTA 뿐이고
    // 그쪽이 이미 carwash_card_click 을 기록한다(같은 행동을 두 번 세지 않는다).
    setOpen(true);
    onOpenChange?.(true);
  }, [openSignal, onOpenChange]);

  // ── 제스처: 펼침 ↔ 목록 스크롤 ↔ 바깥 스크롤을 한 손짓으로 이어 붙인다 ──────
  //
  // 왜 이렇게까지: 지도가 첫 화면 대부분을 덮고 카카오 지도가 세로 드래그를 패닝으로 소비하므로,
  // 페이지를 스크롤할 수 있는 곳은 사실상 이 시트뿐이다. 이전 구현은 핸들러가 셋으로 쪼개져
  // (peek 전용 열기 / 손잡이 전용 닫기 / 목록 전용 체이닝) **잡는 위치마다 반응이 달랐고**,
  // 시트도 손가락을 따라오지 않고 2단으로 튀었다.
  //
  // 이제 시트 루트에 붙은 touchmove 하나가 이동량을 순서대로 소비한다:
  //   위로   시트 펼침(손가락 추종) → 목록 스크롤 → 바깥 스크롤
  //   아래로 바깥 스크롤 → 목록 스크롤 → 시트 접힘(손가락 추종)
  // 어디를 잡든 같은 규칙이라 '여기선 되고 저기선 안 되는' 문제가 사라진다.
  //
  // 접힘 상태에서 목록을 overflow-hidden 으로 두는 게 핵심이다(아래 listClass).
  // 네이티브 스크롤이 아예 시작되지 않아야 브라우저가 제스처를 가져가지 않고,
  // 그래야 시트가 손가락을 따라올 수 있다.
  //
  // ⚠️ 한계(브라우저 제약): iOS/Chrome 은 네이티브 스크롤이 시작되면 그 제스처 동안
  //    preventDefault 를 무시한다. 그래서 '목록 한가운데에서 한 번에 쭉 내려 시트까지 접기'는
  //    한 손짓으로 되지 않는다 — 목록이 맨 위에 닿으면 거기서 멈추고, 손을 뗐다 다시 내려야
  //    접힌다. 없애려면 목록 스크롤까지 관성 포함해 직접 구동해야 하는데 네이티브보다
  //    어색해질 위험이 커서 택하지 않았다.
  const lastDragAt = useRef(0);
  const sheetElRef = useRef<HTMLDivElement | null>(null);
  const listElRef = useRef<HTMLDivElement | null>(null);

  // 네이티브 리스너는 마운트 시 한 번만 등록되므로 렌더마다 새로 만들어지는 값은
  // ref 로 건네야 한다(안 그러면 첫 렌더의 layer·onOpenChange 를 계속 붙든다).
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  function applyOpen(next: boolean, via: 'tap' | 'swipe') {
    if (openRef.current === next) return;
    openRef.current = next;
    // 시트 펼침은 '목록을 실제로 보려 한' 신호다. 여는 방식(탭/스와이프)까지 남겨야
    // 스와이프 제스처가 쓰이는지 판단할 수 있다. 접힘은 기록하지 않는다(잡음).
    if (next) track('sheet_open', { layer, via });
    setOpen(next);
    onOpenChange?.(next);
  }
  const applyOpenRef = useRef(applyOpen);
  applyOpenRef.current = applyOpen;

  /** el 위쪽에서 실제로 스크롤 가능한 가장 가까운 조상.
   *  closest('.h-dvh') 로 찾으면 안 된다 — 스크롤되지 않는 div.h-dvh.flex.flex-col 이 먼저 걸린다.
   *  지도 컨테이너는 overflow-hidden 이라 자연히 건너뛴다. */
  function nearestScrollable(el: HTMLElement): HTMLElement | null {
    let p = el.parentElement;
    while (p) {
      const ov = getComputedStyle(p).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && p.scrollHeight - p.clientHeight > 1) return p;
      p = p.parentElement;
    }
    return null;
  }

  /** 접힘 위치의 translateY(px) — 시트 실제 높이에서 peek 을 뺀 값. */
  const collapsedY = (el: HTMLElement) => Math.max(0, el.offsetHeight - SHEET_PEEK_PX);
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

  const gesture = useRef<{
    lastY: number; startY: number; lastT: number;
    dragging: boolean;   // 시트를 직접 끌고 있는가
    y: number;           // 현재 translateY(px)
    vUp: number;         // 최근 속도(px/ms, 위로 양수)
    outer: HTMLElement | null;
  } | null>(null);

  const rootCleanup = useRef<(() => void) | null>(null);
  const sheetRef = useCallback((el: HTMLDivElement | null) => {
    rootCleanup.current?.();
    rootCleanup.current = null;
    sheetElRef.current = el;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      gesture.current = {
        lastY: t.clientY, startY: t.clientY, lastT: e.timeStamp,
        dragging: false,
        y: openRef.current ? 0 : collapsedY(el),
        vUp: 0,
        outer: nearestScrollable(el),
      };
    };

    const drag = (g: NonNullable<typeof gesture.current>, dy: number, e: TouchEvent) => {
      g.dragging = true;
      g.y = clamp(g.y - dy, 0, collapsedY(el));
      el.style.transition = 'none';
      el.style.transform = `translateY(${g.y}px)`;
      if (e.cancelable) e.preventDefault();
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      const t = e.touches[0];
      if (!g || !t) return;
      const y = t.clientY;
      const dy = g.lastY - y;                       // 위로 쓸면 양수
      const dt = Math.max(1, e.timeStamp - g.lastT);
      g.lastY = y; g.lastT = e.timeStamp;
      if (dy === 0) return;
      g.vUp = dy / dt;

      // 이미 시트를 끌고 있으면 방향과 무관하게 계속 끈다(되돌리기 포함).
      if (g.dragging) { drag(g, dy, e); return; }

      if (!openRef.current) {
        // 접힘: 목록이 overflow-hidden 이라 네이티브 스크롤이 없다 → 시트를 직접 끈다.
        if (Math.abs(g.startY - y) < DRAG_SLOP_PX) return;
        drag(g, dy, e);
        return;
      }

      const list = listElRef.current;
      if (dy > 0) {
        // 위로 — 목록이 남았으면 네이티브 스크롤에 맡기고, 끝났으면 바깥으로 넘긴다.
        const listAtEnd = !list || list.scrollTop >= list.scrollHeight - list.clientHeight - 1;
        if (!listAtEnd) return;
        const o = g.outer;
        if (o && o.scrollTop < o.scrollHeight - o.clientHeight - 1) {
          o.scrollTop += dy;
          if (e.cancelable) e.preventDefault();
        }
        return;
      }

      // 아래로 — 목록 → 바깥 → 시트 접힘 순으로 되돌린다.
      const listAtTop = !list || list.scrollTop <= 0;
      if (!listAtTop) return;                        // 목록이 남았으면 네이티브에 맡긴다
      const o = g.outer;
      if (o && o.scrollTop > 0) {
        o.scrollTop += dy;                           // dy<0 → 위로 되돌린다
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (Math.abs(g.startY - y) < DRAG_SLOP_PX) return;
      drag(g, dy, e);                                // 목록도 바깥도 끝 → 시트를 접는다
    };

    const onEnd = () => {
      const g = gesture.current;
      gesture.current = null;
      if (!g || !g.dragging) return;
      const max = collapsedY(el);
      // 던지듯 빠르게 움직였으면 방향대로, 아니면 절반을 넘겼는지로 정한다.
      const next = Math.abs(g.vUp) > FLING_VELOCITY ? g.vUp > 0 : g.y < max / 2;
      lastDragAt.current = Date.now();
      // 목표 위치로 직접 애니메이션한 뒤 인라인 스타일을 걷어낸다. 여기서 인라인을 즉시
      // 지우면 React 가 클래스를 바꾸기 전 한 프레임 동안 원위치로 튀어 보인다.
      el.style.transition = `transform ${SNAP_MS}ms`;
      el.style.transform = `translateY(${next ? 0 : max}px)`;
      window.setTimeout(() => {
        if (sheetElRef.current !== el) return;
        el.style.transition = '';
        el.style.transform = '';
      }, SNAP_MS + 20);
      applyOpenRef.current(next, 'swipe');
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    rootCleanup.current = () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  /** 목록 컨테이너 ref — 레이어마다 하나만 렌더되므로 공유해도 된다. */
  const listRef = useCallback((el: HTMLDivElement | null) => { listElRef.current = el; }, []);

  /** 데스크톱 휠. 휠은 브라우저 기본 체이닝이 이미 동작하므로(실측) 목록·바깥은 건드리지 않고
   *  시트 여닫기만 담당한다. 여기서 바깥까지 더하면 기본 체이닝과 겹쳐 두 배로 스크롤된다. */
  function handleWheel(e: React.WheelEvent) {
    if (Math.abs(e.deltaY) < 2) return;
    if (!open) {
      if (e.deltaY > 0) { lastDragAt.current = Date.now(); applyOpen(true, 'swipe'); }
      return;
    }
    const list = listElRef.current;
    if (e.deltaY < 0 && (!list || list.scrollTop <= 0)) {
      lastDragAt.current = Date.now();
      applyOpen(false, 'swipe');
    }
  }

  function toggleOpen() {
    // 스와이프 뒤 따라오는 합성 click 이 방금의 전이를 되돌리지 않게 한다.
    if (Date.now() - lastDragAt.current < CLICK_SUPPRESS_MS) return;
    applyOpen(!open, 'tap');
  }

  const isEv = layer === 'ev';
  const isCarwash = layer === 'carwash';
  const isRepair = layer === 'repair';
  const isRental = layer === 'rental';
  const isParking = layer === 'parking';

  const activeTab: Tab = nearbyEnabled ? tab : 'area';

  // 실제 활성 탭(area/nearby)을 부모로 끌어올린다 — 지도 마커 숫자 표시 집합 연동.
  // nearbyEnabled가 꺼지면(권한 미동의 등) tab이 'nearby'여도 강제로 'area'가 되므로 그 값을 전달.
  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);
  const radiusKm = nearbyRadiusM >= 1000
    ? `${(nearbyRadiusM / 1000).toFixed(nearbyRadiusM % 1000 === 0 ? 0 : 1)}km`
    : `${nearbyRadiusM}m`;

  const areaSorted = [...stations].sort((a, b) => a.price - b.price).slice(0, AREA_LIMIT);
  const nearbySorted = [...nearbyStations].sort((a, b) => a.price - b.price).slice(0, NEARBY_LIMIT);
  const list = activeTab === 'nearby' ? nearbySorted : areaSorted;

  // 가격 텍스트 색(저렴/비쌈)도 지도 마커와 동일하게 "표시 집합의 상대 분포" 기준으로 산정.
  // 활성 탭 모집단(이 지역 전체 stations / 내 주변 nearbyStations) 기준으로 임계값을 산출한다.
  const tierThresholds = priceTierThresholds(
    (activeTab === 'nearby' ? nearbyStations : stations).map((s) => s.price),
  );

  // === EV 레이어: 충전소 목록(사용가능→급속→거리 순). 단가 개념이 없어 "최저가" 표기는 쓰지 않는다. ===
  const evRanked: EvStationRanked[] = isEv
    ? rankEvStations(evStations, evOrigin).slice(0, EV_LIMIT)
    : [];

  // === 세차장 레이어: 세차장 목록(거리순). 가격 개념이 없어 가격 컬럼/정렬은 노출하지 않는다. ===
  const carwashRanked: CarwashRanked[] = isCarwash
    ? carwashPlaces
        .map((p) => ({
          place: p,
          distance: carwashOrigin ? distanceMeters(carwashOrigin.lat, carwashOrigin.lng, p.lat, p.lng) : null,
        }))
        // 거리 있으면 가까운 순, 없으면(좌표 미확보) 원래 순서 유지.
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
        .slice(0, CARWASH_LIMIT)
    : [];

  // === 정비소 레이어: 정비소 목록(거리순). 가격 개념이 없어 가격 컬럼/정렬은 노출하지 않는다. ===
  const repairRanked: RepairRanked[] = isRepair
    ? repairShops
        .map((p) => ({
          shop: p,
          distance: repairOrigin ? distanceMeters(repairOrigin.lat, repairOrigin.lng, p.lat, p.lng) : null,
        }))
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
        .slice(0, REPAIR_LIMIT)
    : [];

  // === 렌터카 레이어: 업체 목록(거리순). 요금은 있으면 함께 보여준다(가격 비교가 이 앱의 정체성). ===
  const rentalRanked: RentalRanked[] = isRental
    ? rentalPlaces
        .map((p) => ({
          place: p,
          distance: rentalOrigin ? distanceMeters(rentalOrigin.lat, rentalOrigin.lng, p.lat, p.lng) : null,
        }))
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
        .slice(0, RENTAL_LIMIT)
    : [];

  // === 주차장 레이어: 직선거리순 목록 ===
  // ★ 정렬 이름을 '가까운 순'/'빠른 순'으로 부르지 않는다. 실제 도로 소요시간이 아니라 직선거리다
  //   (기획 3단계에서 도착시간순으로 바뀔 때까지 과장하지 않는다 — design §0).
  //   모집단 한계도 있다: 서버가 화면 상한 200곳을 **구획수 큰 순**으로 자른 뒤 여기서 거리순으로
  //   정렬하므로, 아주 작은 주차장은 가까워도 목록에 없을 수 있다. 캡션으로 알린다.
  const parkingRanked = isParking
    ? parkingPlaces
        .map((p) => ({
          place: p,
          distance: parkingOrigin ? distanceMeters(parkingOrigin.lat, parkingOrigin.lng, p.lat, p.lng) : null,
        }))
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    : [];

  const title = isParking
    ? t('bottomSheet.titleParkingArea', { count: parkingRanked.length })
    : isRental
    ? t('bottomSheet.titleRentalArea', { count: rentalRanked.length })
    : isEv
    ? t('bottomSheet.titleEvArea', { count: evRanked.length })
    : isCarwash
    ? t('bottomSheet.titleCarwashArea', { count: carwashRanked.length })
    : isRepair
    ? t('bottomSheet.titleRepairArea', { count: repairRanked.length })
    : carwashOnly
      ? activeTab === 'nearby'
        ? t('bottomSheet.titleCarwashOnlyNearby', { radius: radiusKm })
        : t('bottomSheet.titleCarwashOnlyArea', { count: Math.min(areaSorted.length, AREA_LIMIT) })
      : activeTab === 'nearby'
        ? t('bottomSheet.titleNearby', { radius: radiusKm, count: NEARBY_LIMIT })
        : t('bottomSheet.titleArea', { count: Math.min(areaSorted.length, AREA_LIMIT) });

  // 접힘 상태에선 목록을 스크롤 불가로 둔다 — 네이티브 스크롤이 시작되지 않아야
  // 시트 드래그가 제스처를 온전히 소유하고 손가락을 따라올 수 있다(위 제스처 주석 참고).
  // 두 리터럴 모두 정적으로 남겨 Tailwind JIT 가 스캔할 수 있게 한다.
  const listClass = clsx(
    'max-h-[calc(70vh-96px)] pb-[calc(8px+env(safe-area-inset-bottom))]',
    open ? 'overflow-y-auto' : 'overflow-hidden',
  );

  return (
    <div
      className={clsx(
        'pointer-events-auto absolute inset-x-0 bottom-0 z-20 rounded-t-2xl bg-white shadow-sheet transition-transform duration-300 dark:bg-gray-900',
        // 접힘 시 SHEET_PEEK_PX(96px)만 노출. Tailwind JIT가 정적으로 스캔하도록 리터럴 유지.
        open ? 'translate-y-0' : 'translate-y-[calc(100%-96px)]',
      )}
      style={{ maxHeight: `${SHEET_OPEN_VH}vh` }}
      ref={sheetRef}
      onWheel={handleWheel}
    >
      <button
        onClick={toggleOpen}
        className="flex w-full items-center justify-between px-5 py-3"
      >
        <div className="flex items-center gap-2">
          <div className="h-1 w-9 rounded bg-gray-300 dark:bg-gray-600" />
          <span className="ml-2 text-sm font-bold text-gray-800 dark:text-gray-100">{title}</span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">{open ? t('bottomSheet.collapse') : t('bottomSheet.expand')}</span>
      </button>

      {/* 탭: 주유소 레이어 + 내 위치 권한 동의 후에만 '내 주변' 노출. EV/세차장 레이어는 탭 없음(단일 목록). */}
      {!isEv && !isCarwash && !isRepair && !isRental && nearbyEnabled && (
        <div className="flex gap-1 px-5 pb-3.5">
          <TabButton active={activeTab === 'area'} onClick={() => setTab('area')}>
            {t('bottomSheet.tabArea')}
          </TabButton>
          <TabButton active={activeTab === 'nearby'} onClick={() => setTab('nearby')}>
            {t('bottomSheet.tabNearby', { radius: radiusKm })}
          </TabButton>
        </div>
      )}

      {/* EV 레이어: 충전소 목록(사용가능→급속→거리). 주유소 목록 대신 노출. */}
      {isEv ? (
        <div ref={listRef} className={listClass}>
          {evRanked.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              {t('bottomSheet.emptyEv')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {evRanked.map((s, i) => (
                <EvRow
                  key={s.statId}
                  station={s}
                  index={i}
                  onSelect={onSelectEv}
                  onNavigate={onNavigateEv}
                />
              ))}
            </ul>
          )}
        </div>
      ) : isCarwash ? (
        /* 세차장 레이어: 세차장 목록(거리순). 가격 컬럼/정렬 없음 — 이름+유형 뱃지+거리+주소만. */
        <div ref={listRef} className={listClass}>
          {carwashRanked.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              {t('bottomSheet.emptyCarwash')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {carwashRanked.map((c, i) => (
                <CarwashRow
                  key={c.place.mgmtNo}
                  place={c.place}
                  distance={c.distance}
                  index={i}
                  onSelect={onSelectCarwash}
                  onNavigate={onNavigateCarwash}
                />
              ))}
            </ul>
          )}
        </div>
      ) : isRepair ? (
        /* 정비소 레이어: 정비소 목록(거리순). 가격 컬럼/정렬 없음 — 이름+유형 뱃지+거리+주소만. */
        <div ref={listRef} className={listClass}>
          {repairRanked.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              {t('bottomSheet.emptyRepair')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {repairRanked.map((r, i) => (
                <RepairRow
                  key={r.shop.shopKey}
                  shop={r.shop}
                  distance={r.distance}
                  index={i}
                  onSelect={onSelectRepair}
                  onNavigate={onNavigateRepair}
                />
              ))}
            </ul>
          )}
        </div>
      ) : isParking ? (
        /* 주차장 레이어: 직선거리순 목록. 캡션으로 정렬 기준과 '빈자리 모름'을 상시 고지한다. */
        <div ref={listRef} className={listClass}>
          <p className="px-5 pb-1 pt-2 text-[11px] text-gray-400 dark:text-gray-500">
            {t('parking.sortStraightLine')} · {t('parking.noVacancyShort')}
          </p>
          {parkingRanked.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              {parkingFree ? t('bottomSheet.emptyParkingFree') : t('bottomSheet.emptyParking')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {parkingRanked.map((r, i) => (
                <ParkingRow
                  key={r.place.placeKey}
                  place={r.place}
                  distance={r.distance}
                  index={i}
                  onSelect={onSelectParking}
                  onNavigate={onNavigateParking}
                />
              ))}
            </ul>
          )}
        </div>
      ) : isRental ? (
        /* 렌터카 레이어: 업체 목록(거리순). 요금이 있으면 우측에 대표 요금을 보여준다. */
        <div ref={listRef} className={listClass}>
          {rentalRanked.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              {t('bottomSheet.emptyRental')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {rentalRanked.map((r, i) => (
                <RentalRow
                  key={r.place.placeKey}
                  place={r.place}
                  distance={r.distance}
                  index={i}
                  onSelect={onSelectRental}
                  onNavigate={onNavigateRental}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
      /* 시트 높이(SHEET_OPEN_VH=70vh)에서 손잡이/탭 영역(SHEET_PEEK_PX=96px)을 뺀 스크롤 영역 */
      <div ref={listRef} className={listClass}>
        {list.length === 0 ? (
          carwashOnly ? (
            // 세차 필터 빈 상태(AC-4) — DropletIcon + 안내 + 탈출구("세차 필터 끄기").
            <div className="flex flex-col items-center px-5 py-8 text-center">
              <DropletIcon className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                {activeTab === 'nearby'
                  ? t('bottomSheet.emptyCarwashOnlyNearby', { radius: radiusKm })
                  : t('bottomSheet.emptyCarwashOnlyArea')}
              </p>
              {onDisableCarwash && (
                <button
                  onClick={onDisableCarwash}
                  className="mt-3 rounded-full px-4 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  {t('bottomSheet.disableCarwashFilter')}
                </button>
              )}
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              {activeTab === 'nearby'
                ? t('bottomSheet.emptyNearby', { radius: radiusKm })
                : t('bottomSheet.emptyArea')}
            </p>
          )
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {list.map((s, i) => {
              const tier = priceTier(s.price, tierThresholds);
              const tierColor = tier === 'cheap' ? 'text-cheap' : tier === 'expensive' ? 'text-expensive' : 'text-gray-800 dark:text-gray-100';
              const distanceText = s.distance != null
                ? s.distance < 1000 ? `${Math.round(s.distance)}m` : `${(s.distance / 1000).toFixed(1)}km`
                : null;
              // 전국 최저가 TOP10에 든 주유소면 '전국 N위' 배지만 단다(행 배경/테두리 강조는 없음).
              const nationalRank = nationalTop10Rank?.get(s.id);
              const isNationalTop = nationalRank != null;
              return (
                <li key={s.id}>
                  <div className="flex w-full items-center gap-3 px-5 py-3">
                    <button onClick={() => onSelect(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="w-5 text-center text-xs font-bold text-gray-500 dark:text-gray-400">{i + 1}</span>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: BRAND_COLOR[s.brand] ?? '#666' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{s.name}</span>
                          {isNationalTop && (
                            <span className="top10-shimmer inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-300 bg-gradient-to-r from-amber-300 to-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-amber-950 shadow-sm">
                              {/* 색 미지정 — 배지 텍스트색(amber-950)을 currentColor로 상속 */}
                              <CrownIcon className="h-3 w-3" />
                              {t('bottomSheet.nationalRank', { rank: nationalRank })}
                            </span>
                          )}
                          {/* 세차 배지 — hasCarwash 확정 시 상시 노출(상세 AmenityList emerald 톤과 정합). */}
                          {s.hasCarwash && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              <DropletIcon className="h-3 w-3" />{t('bottomSheet.carwashBadge')}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {brandLabel(s.brand)}{s.isSelf ? ` · ${t('selfService')}` : ''}
                          {distanceText ? ` · ${distanceText}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={clsx('text-sm font-extrabold', tierColor)}>
                          ₩{s.price.toLocaleString()}
                        </div>
                        <Link
                          href={`/station/${encodeURIComponent(s.id)}`}
                          className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t('bottomSheet.detail')} <ChevronRightIcon className="h-3 w-3" />
                        </Link>
                      </div>
                    </button>
                    {onNavigate && (
                      <button
                        onClick={() => onNavigate(s)}
                        aria-label={t('bottomSheet.navigateAria', { name: s.name })}
                        title={t('bottomSheet.kakaoNaviTitle')}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                      >
                        {/* icon_transparent.png는 투명 배경이라 사각/흰배경 문제가 없어 클립 래퍼 없이 직접 표시한다. */}
                        <Image src="/icons/icon_transparent.png" alt="" width={36} height={36} className="block" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}

// EV 충전소 1행 — 충전소명·운영기관·급속/완속·사용가능 N/전체 M·(있으면)거리.
// 가격/단가 표기는 넣지 않는다(EV 단가 데이터 없음).
function EvRow({
  station,
  index,
  onSelect,
  onNavigate,
}: {
  station: EvStationRanked;
  index: number;
  onSelect?: (s: EvStationMarker) => void;
  onNavigate?: (s: EvStationMarker) => void;
}) {
  const t = useTranslations('map');
  const available = station.availableChargers > 0;
  const distanceText = station.distance != null
    ? station.distance < 1000 ? `${Math.round(station.distance)}m` : `${(station.distance / 1000).toFixed(1)}km`
    : null;
  const dot = available ? '#16A34A' : '#9CA3AF';
  return (
    <li>
      <div className="flex w-full items-center gap-3 px-5 py-3">
        <button
          onClick={() => onSelect?.(station)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="w-5 text-center text-xs font-bold text-gray-500 dark:text-gray-400">{index + 1}</span>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{station.name}</span>
              {station.hasFast && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  <BoltFilledIcon className="h-3.5 w-3.5" />{t('fastCharge')}
                </span>
              )}
            </div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {station.busiNm ?? t('bottomSheet.evOperatorUnknown')}
              {station.hasSlow && !station.hasFast ? ` · ${t('slowCharge')}` : ''}
              {distanceText ? ` · ${distanceText}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className={clsx('text-sm font-extrabold', available ? 'text-cheap' : 'text-gray-400 dark:text-gray-500')}>
              {station.availableChargers}
              <span className="ml-0.5 text-xs font-medium text-gray-400 dark:text-gray-500">{t('chargerCount', { count: station.totalChargers })}</span>
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{available ? t('available') : t('bottomSheet.waiting')}</span>
          </div>
        </button>
        {onNavigate && (
          <button
            onClick={() => onNavigate(station)}
            aria-label={t('bottomSheet.navigateAria', { name: station.name })}
            title={t('bottomSheet.kakaoNaviTitle')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Image src="/icons/icon_transparent.png" alt="" width={36} height={36} className="block" />
          </button>
        )}
      </div>
    </li>
  );
}

// 세차장 1행 — 세차장명 + 유형 뱃지 + (있으면)거리 + 주소 요약. 가격/단가 표기는 없다(세차장 가격 데이터 없음).
// 행 탭 → 상세 페이지(onSelect), 우측 아이콘 → 길안내(onNavigate).
function CarwashRow({
  place,
  distance,
  index,
  onSelect,
  onNavigate,
}: {
  place: CarwashMarker;
  distance: number | null;
  index: number;
  onSelect?: (p: CarwashMarker) => void;
  onNavigate?: (p: CarwashMarker) => void;
}) {
  const t = useTranslations('map');
  const tCommon = useTranslations('common');
  const address = place.roadAddr ?? place.jibunAddr ?? null;
  const distanceText = distance != null
    ? distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(1)}km`
    : null;
  return (
    <li>
      <div className="flex w-full items-center gap-3 px-5 py-3">
        <button
          onClick={() => onSelect?.(place)}
          aria-label={t('bottomSheet.detailAria', { name: place.name })}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="w-5 text-center text-xs font-bold text-gray-500 dark:text-gray-400">{index + 1}</span>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: WASH_TYPE_COLOR[place.washType] }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{place.name}</span>
              <CarwashTypeBadge type={place.washType} />
            </div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {distanceText ? `${distanceText}${address ? ' · ' : ''}` : ''}
              {address ?? (distanceText ? '' : t('bottomSheet.addressUnknown'))}
            </div>
          </div>
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
        </button>
        {onNavigate && (
          <button
            onClick={() => onNavigate(place)}
            aria-label={t('bottomSheet.navigateAria', { name: place.name })}
            // CarwashRow는 원래 "길안내" 단독 타이틀 — common과 동일 텍스트
            title={tCommon('navigate')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Image src="/icons/icon_transparent.png" alt="" width={36} height={36} className="block" />
          </button>
        )}
      </div>
    </li>
  );
}

/** 정비소 목록 행 — CarwashRow 와 동형(가격 없음, 이름+유형 뱃지+거리+주소). */
/**
 * 주차장 목록 행 — 거리 · 이름 · (공영/민영·노상노외) · 요금 · 규모.
 *
 * ★ 규모 표기는 반드시 "총 N면"이다. 맨숫자 'N면'은 잔여면수로 읽힌다(design §6-1).
 *   '여유'·'자리 있음'·'잔여' 같은 말은 쓰지 않는다 — 우리는 빈자리를 모른다.
 * ★ 요금 숫자에는 단위를 앞에 붙인다("5분 100원"). 단위 없는 원화 숫자는 이 앱에서 유가다.
 */
function ParkingRow({
  place,
  distance,
  index,
  onSelect,
  onNavigate,
}: {
  place: ParkingMarker;
  distance: number | null;
  index: number;
  onSelect?: (p: ParkingMarker) => void;
  onNavigate?: (p: ParkingMarker) => void;
}) {
  const t = useTranslations('map');
  const address = place.roadAddr ?? place.jibunAddr ?? null;
  const distanceText = distance != null
    ? distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(1)}km`
    : null;
  const feeCode = toFeeKindCode(place.feeKind);
  const lotKindCode = toLotKindCode(place.lotKind);
  // 매핑 실패 시 원문을 그대로 노출한다 — 사라지는 것보다 낫다(lib/parking/labels.ts 주석).
  const kindText = lotKindCode ? t(`parking.lotKind.${lotKindCode}`) : place.lotKind;
  const free = feeCode === 'free';
  return (
    <li>
      <div className="flex w-full items-center gap-3 px-5 py-3">
        <button
          onClick={() => onSelect?.(place)}
          aria-label={t('bottomSheet.detailAria', { name: place.name })}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="w-5 text-center text-xs font-bold text-gray-500 dark:text-gray-400">{index + 1}</span>
          {/* 무료=속 빈 점, 유료=채운 점 — 지도 핀의 채움 반전과 같은 규칙(색 대비가 아니라 형태 대비). */}
          <span
            className={clsx(
              'h-2.5 w-2.5 shrink-0 rounded-full border-2',
              free ? 'border-indigo-600 bg-transparent dark:border-indigo-400' : 'border-indigo-600 bg-indigo-600 dark:border-indigo-400 dark:bg-indigo-400',
            )}
          />
          {/* 폭이 늘어도(3단계에서 도착시간이 붙어도) 요금 컬럼이 밀리지 않도록 min-w-0 + truncate */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{place.name}</span>
              {kindText && (
                <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {kindText}
                </span>
              )}
            </div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {distanceText ? `${distanceText} · ` : ''}
              {place.capacity != null ? t('parking.capacity', { count: place.capacity }) : t('parking.capacityUnknown')}
              {address ? ` · ${address}` : ''}
            </div>
          </div>
          <span className="shrink-0 text-right">
            {place.basicCharge != null && place.basicTime != null ? (
              <>
                <span className="block text-sm font-extrabold text-gray-900 dark:text-gray-50">
                  ₩{place.basicCharge.toLocaleString()}
                </span>
                <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                  {t('parking.feeUnit', { time: place.basicTime })}
                </span>
              </>
            ) : (
              <span className={clsx(
                'block text-sm font-extrabold',
                free ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500',
              )}>
                {feeCode === 'free' ? t('parking.feeFree')
                  : feeCode === 'paid' ? t('parking.feePaid')
                  : feeCode === 'mixed' ? t('parking.feeMixed')
                  : t('parking.feeUnknown')}
              </span>
            )}
          </span>
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
        </button>
        {onNavigate && (
          <button
            onClick={() => onNavigate(place)}
            aria-label={t('bottomSheet.navigateAria', { name: place.name })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Image src="/icons/icon_transparent.png" alt="" width={36} height={36} className="block" />
          </button>
        )}
      </div>
    </li>
  );
}

function RentalRow({
  place,
  distance,
  index,
  onSelect,
  onNavigate,
}: {
  place: RentalMarker;
  distance: number | null;
  index: number;
  onSelect?: (p: RentalMarker) => void;
  onNavigate?: (p: RentalMarker) => void;
}) {
  const t = useTranslations('map');
  const tCommon = useTranslations('common');
  const tClass = useTranslations('map.rentalCarClass');
  const address = place.roadAddr ?? place.jibunAddr ?? null;
  const distanceText = distance != null
    ? distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(1)}km`
    : null;
  // 대표 요금 = 가장 저렴한 차종. 없으면 요금 칸 자체를 그리지 않는다(빈 말/0원 금지).
  const fee = primaryFee(place.fees);
  return (
    <li>
      <div className="flex w-full items-center gap-3 px-5 py-3">
        <button
          onClick={() => onSelect?.(place)}
          aria-label={t('bottomSheet.detailAria', { name: place.name })}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="w-5 text-center text-xs font-bold text-gray-500 dark:text-gray-400">{index + 1}</span>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: place.evCars > 0 ? RENTAL_EV_COLOR : RENTAL_COLOR }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{place.name}</span>
              {place.evCars > 0 && (
                <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300">
                  {t('rentalFilter.ev')}
                </span>
              )}
            </div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {distanceText ? `${distanceText}${address ? ' · ' : ''}` : ''}
              {address ?? (distanceText ? '' : t('bottomSheet.addressUnknown'))}
            </div>
          </div>
          {fee && (
            <span className="shrink-0 text-right">
              <span className="block text-sm font-extrabold text-gray-900 dark:text-gray-50">
                ₩{fee.price.toLocaleString()}
              </span>
              <span className="block text-[10px] text-gray-400 dark:text-gray-500">{tClass(fee.carClass)}</span>
            </span>
          )}
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
        </button>
        {onNavigate && (
          <button
            onClick={() => onNavigate(place)}
            aria-label={t('bottomSheet.navigateAria', { name: place.name })}
            title={tCommon('navigate')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Image src="/icons/icon_transparent.png" alt="" width={36} height={36} className="block" />
          </button>
        )}
      </div>
    </li>
  );
}

function RepairRow({
  shop,
  distance,
  index,
  onSelect,
  onNavigate,
}: {
  shop: RepairMarker;
  distance: number | null;
  index: number;
  onSelect?: (p: RepairMarker) => void;
  onNavigate?: (p: RepairMarker) => void;
}) {
  const t = useTranslations('map');
  const tCommon = useTranslations('common');
  const address = shop.roadAddr ?? shop.jibunAddr ?? null;
  const distanceText = distance != null
    ? distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(1)}km`
    : null;
  return (
    <li>
      <div className="flex w-full items-center gap-3 px-5 py-3">
        <button
          onClick={() => onSelect?.(shop)}
          aria-label={t('bottomSheet.detailAria', { name: shop.name })}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="w-5 text-center text-xs font-bold text-gray-500 dark:text-gray-400">{index + 1}</span>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: shop.brand ? REPAIR_BRAND_COLOR[shop.brand] : REPAIR_TYPE_COLOR[shop.shopType] }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{shop.name}</span>
              {shop.brand ? (
                <RepairBrandBadge brand={shop.brand} />
              ) : (
                <RepairTypeBadge type={shop.shopType} />
              )}
            </div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {distanceText ? `${distanceText}${address ? ' · ' : ''}` : ''}
              {address ?? (distanceText ? '' : t('bottomSheet.addressUnknown'))}
            </div>
          </div>
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
        </button>
        {onNavigate && (
          <button
            onClick={() => onNavigate(shop)}
            aria-label={t('bottomSheet.navigateAria', { name: shop.name })}
            title={tCommon('navigate')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Image src="/icons/icon_transparent.png" alt="" width={36} height={36} className="block" />
          </button>
        )}
      </div>
    </li>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-primary text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
      )}
    >
      {children}
    </button>
  );
}
