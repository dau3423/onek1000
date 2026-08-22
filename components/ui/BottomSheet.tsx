'use client';

import type { MapLayer } from '@/stores/map';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { StationWithPrice } from '@/types/station';
import { BRAND_COLOR } from '@/types/station';
import { useBrandLabel } from '@/lib/i18n/labels';
import { priceTier, priceTierThresholds, distanceMeters } from '@/lib/map/geo';
import type { EvStationMarker } from '@/types/ev';
import { rankEvStations, type EvStationRanked, type EvSortOrigin } from '@/lib/ev/sort';
import type { CarwashMarker } from '@/types/carwash';
import type { RepairMarker } from '@/types/repair';
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
  /**
   * 세차장 거리 계산/정렬 기준 좌표(내 위치 우선, 없으면 화면 중심). null이면 거리 미표시.
   * 세차장엔 가격이 없으므로 정렬은 거리순(좌표 있을 때)만 적용한다.
   */
  carwashOrigin?: { lat: number; lng: number } | null;
  /** 정비소 거리 계산 기준 좌표(내 위치 → 지도 중심 폴백). */
  repairOrigin?: { lat: number; lng: number } | null;
  /** 세차장 선택 콜백(상세 이동). */
  onSelectCarwash?: (p: CarwashMarker) => void;
  onSelectRepair?: (p: RepairMarker) => void;
  /** 세차장 길안내 콜백. */
  onNavigateCarwash?: (p: CarwashMarker) => void;
  onNavigateRepair?: (p: RepairMarker) => void;
}

const NEARBY_LIMIT = 10;
const AREA_LIMIT = 30;
// EV 레이어 목록 상한. 충전소는 밀도가 높아 과도 렌더 방지(정렬은 가져온 집합 내에서).
const EV_LIMIT = 50;
// 세차장 레이어 목록 상한(EV와 동일 취지).
const CARWASH_LIMIT = 50;
const REPAIR_LIMIT = 50;

/** 세차장 목록 1행 표시용(거리 계산 결과 동봉). */
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
  onDisableCarwash,
  openSignal,
  layer = 'gas',
  evStations = [],
  evOrigin = null,
  onSelectEv,
  onNavigateEv,
  carwashPlaces = [],
  repairShops = [],
  carwashOrigin = null,
  repairOrigin = null,
  onSelectCarwash,
  onSelectRepair,
  onNavigateCarwash,
  onNavigateRepair,
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
    setOpen(true);
    onOpenChange?.(true);
  }, [openSignal, onOpenChange]);

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      onOpenChange?.(next);
      return next;
    });
  }

  const isEv = layer === 'ev';
  const isCarwash = layer === 'carwash';
  const isRepair = layer === 'repair';

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

  const title = isEv
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

  return (
    <div
      className={clsx(
        'pointer-events-auto absolute inset-x-0 bottom-0 z-20 rounded-t-2xl bg-white shadow-sheet transition-transform duration-300 dark:bg-gray-900',
        // 접힘 시 SHEET_PEEK_PX(96px)만 노출. Tailwind JIT가 정적으로 스캔하도록 리터럴 유지.
        open ? 'translate-y-0' : 'translate-y-[calc(100%-96px)]',
      )}
      style={{ maxHeight: `${SHEET_OPEN_VH}vh` }}
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
      {!isEv && !isCarwash && !isRepair && nearbyEnabled && (
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
        <div className="max-h-[calc(70vh-96px)] overflow-y-auto pb-[calc(8px+env(safe-area-inset-bottom))]">
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
        <div className="max-h-[calc(70vh-96px)] overflow-y-auto pb-[calc(8px+env(safe-area-inset-bottom))]">
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
        <div className="max-h-[calc(70vh-96px)] overflow-y-auto pb-[calc(8px+env(safe-area-inset-bottom))]">
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
      ) : (
      /* 시트 높이(SHEET_OPEN_VH=70vh)에서 손잡이/탭 영역(SHEET_PEEK_PX=96px)을 뺀 스크롤 영역 */
      <div className="max-h-[calc(70vh-96px)] overflow-y-auto pb-[calc(8px+env(safe-area-inset-bottom))]">
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
