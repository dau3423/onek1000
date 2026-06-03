'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import clsx from 'clsx';
import type { StationWithPrice } from '@/types/station';
import { BRAND_LABEL, BRAND_COLOR } from '@/types/station';
import { priceTier, priceTierThresholds } from '@/lib/map/geo';
import type { EvStationMarker } from '@/types/ev';
import { rankEvStations, type EvStationRanked, type EvSortOrigin } from '@/lib/ev/sort';

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
   * 활성 탭 변화 통지 (부모가 지도 마커 숫자 표시 집합을 연동).
   * 실제 활성 탭은 nearbyEnabled 여부를 반영한 값(area/nearby)을 전달한다.
   */
  onTabChange?: (tab: Tab) => void;

  // === 전기차 충전소(EV) 레이어 ===
  /** 현재 지도 레이어. 'ev'면 주유소 목록 대신 충전소 목록을 표시한다. 기본 'gas'. */
  layer?: 'gas' | 'ev';
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
}

const NEARBY_LIMIT = 10;
const AREA_LIMIT = 30;
// EV 레이어 목록 상한. 충전소는 밀도가 높아 과도 렌더 방지(정렬은 가져온 집합 내에서).
const EV_LIMIT = 50;

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
  layer = 'gas',
  evStations = [],
  evOrigin = null,
  onSelectEv,
  onNavigateEv,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('area');

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      onOpenChange?.(next);
      return next;
    });
  }

  const isEv = layer === 'ev';

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

  const title = isEv
    ? `이 지역 충전소 ${evRanked.length}곳`
    : activeTab === 'nearby'
      ? `내 주변 ${radiusKm} 최저가 TOP ${NEARBY_LIMIT}`
      : `이 지역 최저가 TOP ${Math.min(areaSorted.length, AREA_LIMIT)}`;

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
        <span className="text-xs text-gray-500 dark:text-gray-400">{open ? '접기 ▾' : '펼치기 ▴'}</span>
      </button>

      {/* 탭: 주유소 레이어 + 내 위치 권한 동의 후에만 '내 주변' 노출. EV 레이어는 탭 없음(충전소 단일 목록). */}
      {!isEv && nearbyEnabled && (
        <div className="flex gap-1 px-5 pb-3.5">
          <TabButton active={activeTab === 'area'} onClick={() => setTab('area')}>
            이 지역
          </TabButton>
          <TabButton active={activeTab === 'nearby'} onClick={() => setTab('nearby')}>
            내 주변 {radiusKm}
          </TabButton>
        </div>
      )}

      {/* EV 레이어: 충전소 목록(사용가능→급속→거리). 주유소 목록 대신 노출. */}
      {isEv ? (
        <div className="max-h-[calc(70vh-96px)] overflow-y-auto pb-[calc(8px+env(safe-area-inset-bottom))]">
          {evRanked.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              이 영역에 표시할 충전소가 없어요. 지도를 이동해보세요.
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
      ) : (
      /* 시트 높이(SHEET_OPEN_VH=70vh)에서 손잡이/탭 영역(SHEET_PEEK_PX=96px)을 뺀 스크롤 영역 */
      <div className="max-h-[calc(70vh-96px)] overflow-y-auto pb-[calc(8px+env(safe-area-inset-bottom))]">
        {list.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {activeTab === 'nearby'
              ? `반경 ${radiusKm} 안에 주유소 정보가 없어요.`
              : '이 영역에 표시할 주유소가 없어요. 지도를 이동해보세요.'}
          </p>
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
                            <span className="top10-shimmer shrink-0 rounded-full border border-amber-300 bg-gradient-to-r from-amber-300 to-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-amber-950 shadow-sm">
                              👑 전국 {nationalRank}위
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {BRAND_LABEL[s.brand]}{s.isSelf ? ' · 셀프' : ''}
                          {distanceText ? ` · ${distanceText}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={clsx('text-sm font-extrabold', tierColor)}>
                          ₩{s.price.toLocaleString()}
                        </div>
                        <Link
                          href={`/station/${s.id}`}
                          className="text-[11px] text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          상세 →
                        </Link>
                      </div>
                    </button>
                    {onNavigate && (
                      <button
                        onClick={() => onNavigate(s)}
                        aria-label={`${s.name} 길안내`}
                        title="카카오내비 길안내"
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
                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  ⚡급속
                </span>
              )}
            </div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {station.busiNm ?? '운영기관 미상'}
              {station.hasSlow && !station.hasFast ? ' · 완속' : ''}
              {distanceText ? ` · ${distanceText}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className={clsx('text-sm font-extrabold', available ? 'text-cheap' : 'text-gray-400 dark:text-gray-500')}>
              {station.availableChargers}
              <span className="ml-0.5 text-xs font-medium text-gray-400 dark:text-gray-500">/ {station.totalChargers}대</span>
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{available ? '사용 가능' : '대기'}</span>
          </div>
        </button>
        {onNavigate && (
          <button
            onClick={() => onNavigate(station)}
            aria-label={`${station.name} 길안내`}
            title="카카오내비 길안내"
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
