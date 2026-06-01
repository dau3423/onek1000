'use client';

import { useEffect, useRef } from 'react';
import { BRAND_COLOR } from '@/types/station';

interface Props {
  onClose: () => void;
}

// 마커 색상은 KakaoMap의 렌더 상수와 일치해야 한다(시각 일관성).
//  - 가격 tier 안쪽(채움): lib/map/geo.ts priceTier → KakaoMap tierColor
//  - 브랜드 테두리: types/station.ts BRAND_COLOR
//  - 전국 TOP10: HL_COLOR(앰버, 가격 라벨 보조 단서), 내 주변 TOP10: NEAR_COLOR(블루, 보조 단서), 내 위치: #1d4ed8
const TIER_CHEAP = '#16A34A';
const TIER_NORMAL = '#EAB308';
const TIER_EXPENSIVE = '#DC2626';
const HL_COLOR = '#F59E0B';
const NEAR_COLOR = '#2563EB';
const MY_COLOR = '#1d4ed8';

const BRANDS: { label: string; color: string }[] = [
  { label: 'SK에너지', color: BRAND_COLOR.SKE },
  { label: 'GS칼텍스', color: BRAND_COLOR.GSC },
  { label: '현대오일뱅크', color: BRAND_COLOR.HDO },
  { label: 'S-OIL', color: BRAND_COLOR.SOL },
  { label: '알뜰주유소', color: BRAND_COLOR.RTE },
  { label: '자영/기타', color: BRAND_COLOR.ETC },
];

/** 채워진 색 동그라미 칩 */
function Dot({ color, ring }: { color: string; ring?: string }) {
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
      style={{ background: color, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
    />
  );
}

/** 브랜드(테두리)를 강조하는 칩 — 안쪽 회색 점 + 색 테두리 */
function RingDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-gray-400"
      style={{ border: `2.5px solid ${color}` }}
    />
  );
}

/**
 * 전국 TOP10 칩 — 물방울 핀 형태(전국 단서) + 본체는 가격 tier 색(채움), 테두리는 브랜드 색(가변).
 * 실제 지도 마커와 색 역할 일치: 본체=가격 tier 색, 테두리=브랜드 색.
 * 카테고리(전국)는 물방울 형태와 안내 텍스트(앰버 가격 라벨)로 보완한다.
 */
function TopPinChip({ body, ring }: { body: string; ring: string }) {
  return (
    <svg viewBox="0 0 14 18" className="h-4 w-3.5 shrink-0">
      <path
        d="M7 17 C1 11 0.5 8 0.5 6 a6.5 6.5 0 1 1 13 0 C13.5 8 13 11 7 17 Z"
        fill={body}
        stroke={ring}
        strokeWidth={1.6}
      />
    </svg>
  );
}

/**
 * 내 주변 TOP10 칩 — 실제 지도 마커와 동일한 핀 형태(원형 배지 + 아래 꼬리).
 * 색 역할 일치: 본체=가격 tier 색(body), 테두리=브랜드 색(ring), 꼬리=가격 tier 색.
 * 카테고리(내 주변)는 배지 형태와 안내 텍스트(블루 가격 라벨)로 보완한다. 범례용으로 작게 렌더.
 */
function NearBadgeChip({ body, ring }: { body: string; ring: string }) {
  return (
    <span className="relative inline-flex h-[18px] w-3.5 shrink-0 flex-col items-center">
      <span
        className="h-3.5 w-3.5 rounded-full"
        style={{ background: body, border: `2px solid ${ring}` }}
      />
      <span
        className="-mt-[3px] h-[5px] w-[5px] rotate-45"
        style={{ background: body }}
      />
    </span>
  );
}

/**
 * 지도 마커 색상/표식 의미 안내 팝오버.
 * FilterBar 우측 info 버튼에서 띄운다. ESC/바깥클릭으로 닫힌다.
 */
export function MarkerLegend({ onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    // 팝오버 카드로 포커스 이동(접근성)
    cardRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // 바깥클릭 닫기용 투명 오버레이(팝오버 위치는 right-3에 고정)
    <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true">
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="색상 안내"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-3 top-12 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">지도 색상 안내</p>
          <button
            onClick={onClose}
            aria-label="안내 닫기"
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-3 space-y-3 text-xs text-gray-700">
          <section>
            <p className="font-semibold text-gray-900">점 안쪽 색 = 가격 수준</p>
            <p className="text-[11px] text-gray-400">현재 화면 평균 대비</p>
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Dot color={TIER_CHEAP} ring="#ffffff" />
                <span>저렴 (평균 −30원↓)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dot color={TIER_NORMAL} ring="#ffffff" />
                <span>보통 (±30원)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dot color={TIER_EXPENSIVE} ring="#ffffff" />
                <span>비쌈 (평균 +30원↑)</span>
              </div>
            </div>
          </section>

          <section>
            <p className="font-semibold text-gray-900">점 테두리 색 = 브랜드</p>
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {BRANDS.map((b) => (
                <div key={b.label} className="flex items-center gap-1.5">
                  <RingDot color={b.color} />
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="font-semibold text-gray-900">특별 표식</p>
            <p className="text-[11px] text-gray-400">색은 동일(안쪽=가격, 테두리=브랜드), 형태·순위로 종류 구분</p>
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <span className="mt-0.5 flex shrink-0 gap-0.5">
                  <TopPinChip body={TIER_CHEAP} ring={BRAND_COLOR.SKE} />
                  <TopPinChip body={TIER_NORMAL} ring={BRAND_COLOR.GSC} />
                </span>
                <span>
                  물방울 핀 + 메달(🥇🥈🥉)·숫자 = 전국 최저가 TOP 10
                  <span className="text-gray-400"> (가격 라벨</span>
                  <span style={{ color: HL_COLOR }} className="font-semibold"> 앰버</span>
                  <span className="text-gray-400">)</span>
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="mt-0.5 flex shrink-0 gap-0.5">
                  <NearBadgeChip body={TIER_CHEAP} ring={BRAND_COLOR.HDO} />
                  <NearBadgeChip body={TIER_EXPENSIVE} ring={BRAND_COLOR.RTE} />
                </span>
                <span>
                  순위 배지 = 내 주변 10km 최저가 TOP 10
                  <span className="text-gray-400"> (가격 라벨</span>
                  <span style={{ color: NEAR_COLOR }} className="font-semibold"> 블루</span>
                  <span className="text-gray-400">)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dot color={MY_COLOR} ring="#ffffff" />
                <span>파란 점 = 내 현재 위치</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
