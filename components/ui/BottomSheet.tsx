'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import type { StationWithPrice } from '@/types/station';
import { BRAND_LABEL, BRAND_COLOR } from '@/types/station';
import { priceTier, priceTierThresholds } from '@/lib/map/geo';

type Tab = 'area' | 'nearby';

/**
 * 바텀시트 레이아웃 상수 (단일 출처).
 * GPS 버튼 등 시트와 연동되는 요소가 동일 값을 참조해 겹침/오정렬을 방지한다.
 */
/** 접힘 상태에서 노출되는 손잡이 영역 높이(px) */
export const SHEET_PEEK_PX = 72;
/** 펼침 상태의 시트 높이(뷰포트 비율) */
export const SHEET_OPEN_VH = 70;

interface Props {
  stations: StationWithPrice[];
  onSelect: (s: StationWithPrice) => void;
  /** 내 GPS 반경 내 최저가(거리 포함). geo 활성화 시에만 채워짐 */
  nearbyStations?: StationWithPrice[];
  /** 반경 조회 활성화 여부 (내 위치 권한 동의 후) */
  nearbyEnabled?: boolean;
  /** 반경(m) — '내 주변' 탭 라벨 표시용 */
  nearbyRadiusM?: number;
  /** 특정 주유소로 길안내(카카오내비) 시작 요청 */
  onNavigate?: (s: StationWithPrice) => void;
  /** 열림/접힘 상태 변화 통지 (부모가 GPS 버튼 위치 등을 연동) */
  onOpenChange?: (open: boolean) => void;
}

const NEARBY_LIMIT = 10;
const AREA_LIMIT = 30;

export function BottomSheet({
  stations,
  onSelect,
  nearbyStations = [],
  nearbyEnabled = false,
  nearbyRadiusM = 10000,
  onNavigate,
  onOpenChange,
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

  const activeTab: Tab = nearbyEnabled ? tab : 'area';
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

  const title = activeTab === 'nearby'
    ? `내 주변 ${radiusKm} 최저가 TOP ${NEARBY_LIMIT}`
    : `이 지역 최저가 TOP ${Math.min(areaSorted.length, AREA_LIMIT)}`;

  return (
    <div
      className={clsx(
        'pointer-events-auto absolute inset-x-0 bottom-0 z-20 rounded-t-2xl bg-white shadow-sheet transition-transform duration-300 dark:bg-gray-900',
        // 접힘 시 SHEET_PEEK_PX(72px)만 노출. Tailwind JIT가 정적으로 스캔하도록 리터럴 유지.
        open ? 'translate-y-0' : 'translate-y-[calc(100%-72px)]',
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

      {/* 탭: 내 위치 권한 동의 후에만 '내 주변' 노출 */}
      {nearbyEnabled && (
        <div className="flex gap-1 px-5 pb-2">
          <TabButton active={activeTab === 'area'} onClick={() => setTab('area')}>
            이 지역
          </TabButton>
          <TabButton active={activeTab === 'nearby'} onClick={() => setTab('nearby')}>
            내 주변 {radiusKm}
          </TabButton>
        </div>
      )}

      {/* 시트 높이(SHEET_OPEN_VH=70vh)에서 손잡이/탭 영역(~96px)을 뺀 스크롤 영역 */}
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
                        <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{s.name}</div>
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
                        className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-base hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        🧭
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
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
