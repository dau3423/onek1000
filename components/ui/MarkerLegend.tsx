'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { BRAND_COLOR } from '@/types/station';
import type { PriceTier } from '@/lib/map/geo';
import { TIER_FACE, faceSvgInner } from '@/lib/map/markerFace';
import { useMapStore } from '@/stores/map';
import { GRAY_DOTS_ENABLED } from '@/lib/flags';

// EV 마커 색(단일 출처는 lib/map/evMarker.ts — 범례는 시각 일관성을 위해 동일 값을 사용).
const EV_AVAILABLE_COLOR = '#16A34A'; // 초록 — 사용가능
const EV_BUSY_COLOR = '#9CA3AF'; // 회색 — 사용불가(충전중/점검)
const EV_FAST_COLOR = '#F59E0B'; // 앰버 — 급속 보유 뱃지

interface Props {
  onClose: () => void;
  /**
   * 팝오버 카드 위치 클래스(오버레이 기준 absolute). 트리거 위치에 맞춰 조정한다.
   * 기본값은 지도 우측 상단 버튼(약 top-14 right-3) 아래에 자연스럽게 붙도록 한다.
   */
  cardClassName?: string;
}

// 마커 색상/표정은 KakaoMap의 렌더와 일치해야 한다(시각 일관성).
//  - 가격 tier 안쪽(채움)색·표정: lib/map/markerFace.ts TIER_FACE/faceSvgInner (단일 출처)
//  - 브랜드 테두리: types/station.ts BRAND_COLOR
//  - 전국 TOP10: HL_COLOR(앰버, 가격 라벨 보조 단서), 내 주변 TOP10: NEAR_COLOR(블루, 보조 단서), 내 위치: #1d4ed8
const TIER_CHEAP = TIER_FACE.cheap.color;
const TIER_NORMAL = TIER_FACE.normal.color;
const TIER_EXPENSIVE = TIER_FACE.expensive.color;
const HL_COLOR = '#F59E0B';
const NEAR_COLOR = '#2563EB';
const MY_COLOR = '#1d4ed8';

/** 가격 수준 표정 칩 — 지도 일반 마커와 동일한 색·표정(인라인 SVG). */
function FaceChip({ tier }: { tier: PriceTier }) {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0"
      // faceSvgInner는 viewBox 0 0 100 100 기준 표정 경로만 반환 → 배경 원과 함께 합성
      dangerouslySetInnerHTML={{
        __html: `<svg viewBox="0 0 100 100" width="16" height="16" style="display:block">
          <circle cx="50" cy="50" r="46" fill="${TIER_FACE[tier].color}"/>
          ${faceSvgInner(tier)}
        </svg>`,
      }}
    />
  );
}

/** 순위 숫자 칩 — 지도 마커가 활성 목록일 때 표정 대신 표시하는 숫자(가격 순위). */
function NumberChip({ tier, n }: { tier: PriceTier; n: number }) {
  const color = TIER_FACE[tier].color;
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
      style={{ background: color }}
    >
      {n}
    </span>
  );
}

const BRANDS: { label: string; color: string }[] = [
  { label: 'SK에너지', color: BRAND_COLOR.SKE },
  { label: 'GS칼텍스', color: BRAND_COLOR.GSC },
  { label: '현대오일뱅크', color: BRAND_COLOR.HDO },
  { label: 'S-OIL', color: BRAND_COLOR.SOL },
  { label: '알뜰주유소', color: BRAND_COLOR.RTE },
  { label: '고속도로', color: BRAND_COLOR.EXP },
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

/**
 * 브랜드(테두리)를 강조하는 칩 — 실제 일반 마커와 동일하게
 * 안쪽 회색 점(얼굴 자리) + 흰 간격 + 두꺼운 브랜드 테두리(box-shadow 링).
 */
function RingDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-gray-400"
      style={{ boxShadow: `0 0 0 1.5px #fff, 0 0 0 4px ${color}` }}
    />
  );
}

/**
 * 비하이라이트(그 외) 주유소 칩 — 작은 회색 점 + 흰 외곽.
 * 실제 지도의 회색 점 마커(KakaoMap, #9ca3af + 흰 외곽)와 색·형태 일치.
 */
function GrayDotChip() {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: '#9ca3af', boxShadow: '0 0 0 1.5px #fff' }}
    />
  );
}

/**
 * 전국 TOP10 칩 — 물방울 핀 형태(전국 단서) + 본체는 가격 tier 색(채움), 테두리는 브랜드 색(가변).
 * 실제 지도 마커와 색 역할 일치: 본체=가격 tier 색, 테두리=브랜드 색.
 * 카테고리(전국)는 물방울 형태와 안내 텍스트(앰버 가격 라벨)로 보완한다.
 */
function TopPinChip({ body, ring }: { body: string; ring: string }) {
  // 실제 핀과 동일 구조: 브랜드색 물방울(두꺼운 테두리 효과) → 흰 간격 원 → tier 머리 원 + 왕관.
  return (
    <svg viewBox="0 0 14 21" className="h-[21px] w-3.5 shrink-0">
      {/* 왕관(골드) — 머리 위에 얹어 전국 TOP10 단서 표시 */}
      <g transform="translate(3.2 0)">
        <path d="M0.4 4 L0 1.4 L2.2 3 L3.8 0.6 L5.4 3 L7.6 1.4 L7.2 4 Z" fill="#F59E0B" stroke="#fff" strokeWidth="0.5" strokeLinejoin="round" />
      </g>
      <path d="M7 20 C1 14 0.5 11 0.5 9 a6.5 6.5 0 1 1 13 0 C13.5 11 13 14 7 20 Z" fill={ring} />
      <circle cx="7" cy="9" r="5.2" fill="#fff" />
      <circle cx="7" cy="9" r="4.3" fill={body} />
    </svg>
  );
}

/**
 * 내 주변 TOP10 칩 — 실제 지도 마커와 동일한 핀 형태(원형 배지 + 아래 꼬리).
 * 색 역할 일치: 본체=가격 tier 색(body), 테두리=브랜드 색(ring), 꼬리=가격 tier 색.
 * 카테고리(내 주변)는 배지 형태와 안내 텍스트(블루 가격 라벨)로 보완한다. 범례용으로 작게 렌더.
 */
function NearBadgeChip({ body, ring }: { body: string; ring: string }) {
  // 실제 배지와 동일 구조: tier 원 + 흰 간격 + 두꺼운 브랜드 테두리(box-shadow), 브랜드색 꼬리.
  return (
    <span className="relative inline-flex h-[18px] w-4 shrink-0 flex-col items-center pt-[3px]">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: body, boxShadow: `0 0 0 1.5px #fff, 0 0 0 3px ${ring}` }}
      />
      <span
        className="-z-10 -mt-[1px] h-[5px] w-[5px] rotate-45"
        style={{ background: ring }}
      />
    </span>
  );
}

/**
 * EV 충전소 마커 칩 — 번개 핀(사용가능=초록 / 불가=회색). hasFast=급속 뱃지 표시.
 * 실제 지도 마커(lib/map/evMarker.ts)와 색·형태 일치(번개 아이콘 + 급속 앰버 뱃지).
 */
function EvPinChip({ color, hasFast }: { color: string; hasFast?: boolean }) {
  return (
    <svg viewBox="0 -3 17 24" className="h-[21px] w-[14px] shrink-0" style={{ display: 'block' }}>
      {/* 물방울 핀 + 머리 흰 간격 + 안쪽 색 + 번개 */}
      <path d="M7 20 C1 14 0.5 11 0.5 9 a6.5 6.5 0 1 1 13 0 C13.5 11 13 14 7 20 Z" fill={color} />
      <circle cx="7" cy="9" r="5" fill="#fff" />
      <circle cx="7" cy="9" r="4.1" fill={color} />
      <path d="M7.6 5.5 L4.4 9.6 L6.8 9.6 L6.1 12.5 L9.6 8 L7.1 8 Z" fill="#fff" />
      {hasFast && (
        <g>
          <circle cx="12.5" cy="3" r="2.6" fill={EV_FAST_COLOR} stroke="#fff" strokeWidth="0.7" />
          <path d="M12.9 1.4 L11.4 3.4 L12.5 3.4 L12.2 4.8 L13.8 2.7 L12.6 2.7 Z" fill="#fff" />
        </g>
      )}
    </svg>
  );
}

/**
 * 지도 마커 색상/표식 의미 안내 팝오버.
 * FilterBar 우측 info 버튼에서 띄운다. ESC/바깥클릭으로 닫힌다.
 * 레이어(주유소/충전소)에 따라 안내 내용을 전환한다(useMapStore.layer).
 */
export function MarkerLegend({ onClose, cardClassName }: Props) {
  const layer = useMapStore((s) => s.layer);
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
        className={clsx(
          'absolute w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl outline-none dark:border-gray-700 dark:bg-gray-800',
          cardClassName ?? 'right-3 top-[152px]',
        )}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {layer === 'ev' ? '충전소 마커 안내' : '지도 색상 안내'}
          </p>
          <button
            onClick={onClose}
            aria-label="안내 닫기"
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-3 space-y-3 text-xs text-gray-700 dark:text-gray-300">
          {layer === 'ev' ? (
          <>
          <section>
            <p className="font-semibold text-gray-900 dark:text-gray-100">충전기 사용 상태 = 핀 색</p>
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <EvPinChip color={EV_AVAILABLE_COLOR} />
                <span><b className="font-semibold text-gray-900 dark:text-gray-100">초록</b> = 사용가능 충전기 있음</span>
              </div>
              <div className="flex items-center gap-1.5">
                <EvPinChip color={EV_BUSY_COLOR} />
                <span><b className="font-semibold text-gray-900 dark:text-gray-100">회색</b> = 사용불가(전부 충전중·점검·통신이상)</span>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">사용가능 핀은 조금 크게, 불가 핀은 작게 표시돼요.</p>
          </section>

          <section>
            <p className="font-semibold text-gray-900 dark:text-gray-100">급속 충전 = 번개 뱃지</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <EvPinChip color={EV_AVAILABLE_COLOR} hasFast />
              <span>핀 우상단 <span style={{ color: EV_FAST_COLOR }} className="font-semibold">앰버 번개</span> 뱃지 = 급속 충전기 보유</span>
            </div>
          </section>

          <section>
            <p className="font-semibold text-gray-900 dark:text-gray-100">줌인 시 라벨</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">핀 위 라벨은 <b>사용가능/전체</b> 대수 · 급속 보유 여부를 함께 보여줘요.</p>
          </section>

          <section>
            <p className="font-semibold text-gray-900 dark:text-gray-100">내 위치</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Dot color={MY_COLOR} ring="#ffffff" />
              <span>파란 점 = 내 현재 위치</span>
            </div>
          </section>
          </>
          ) : (
          <>
          <section>
            <p className="font-semibold text-gray-900 dark:text-gray-100">마커 숫자 = 가격 순위</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">현재 목록 탭(이 지역 / 내 주변)의 가격 순위 — 1이 가장 쌈</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <NumberChip tier="cheap" n={1} />
              <NumberChip tier="normal" n={2} />
              <NumberChip tier="expensive" n={3} />
              <span>목록 항목과 같은 번호의 마커</span>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">목록 밖 주유소는 표정으로 가격 수준만 표시</p>
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-1.5">
                <FaceChip tier="cheap" />
                <span>{TIER_FACE.cheap.mood} ({TIER_FACE.cheap.hint})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FaceChip tier="normal" />
                <span>{TIER_FACE.normal.mood} ({TIER_FACE.normal.hint})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FaceChip tier="expensive" />
                <span>{TIER_FACE.expensive.mood} ({TIER_FACE.expensive.hint})</span>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">안쪽 색 = 가격 수준(화면 내 비교, 줌·이동 시 바뀜)</p>
          </section>

          <section>
            <p className="font-semibold text-gray-900 dark:text-gray-100">점 테두리 색 = 브랜드</p>
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
            <p className="font-semibold text-gray-900 dark:text-gray-100">특별 표식</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">색은 동일(안쪽=가격, 테두리=브랜드), 형태·순위로 종류 구분</p>
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <span className="mt-0.5 flex shrink-0 gap-0.5">
                  <TopPinChip body={TIER_CHEAP} ring={BRAND_COLOR.SKE} />
                  <TopPinChip body={TIER_NORMAL} ring={BRAND_COLOR.GSC} />
                </span>
                <span>
                  👑 + 순위 숫자(물방울 핀) = 전국 최저가 TOP 10
                  <span className="text-gray-500 dark:text-gray-400"> (가격 라벨</span>
                  <span style={{ color: HL_COLOR }} className="font-semibold"> 앰버</span>
                  <span className="text-gray-500 dark:text-gray-400">)</span>
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="mt-0.5 flex shrink-0 gap-0.5">
                  <NearBadgeChip body={TIER_CHEAP} ring={BRAND_COLOR.HDO} />
                  <NearBadgeChip body={TIER_EXPENSIVE} ring={BRAND_COLOR.RTE} />
                </span>
                <span>
                  순위 배지 = 내 주변 10km 최저가 TOP 10
                  <span className="text-gray-500 dark:text-gray-400"> (가격 라벨</span>
                  <span style={{ color: NEAR_COLOR }} className="font-semibold"> 블루</span>
                  <span className="text-gray-500 dark:text-gray-400">)</span>
                </span>
              </div>
              {GRAY_DOTS_ENABLED && (
                <div className="flex items-center gap-1.5">
                  <GrayDotChip />
                  <span>회색 점 = 그 외 주유소(확대 시 표시)</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Dot color={MY_COLOR} ring="#ffffff" />
                <span>파란 점 = 내 현재 위치</span>
              </div>
            </div>
          </section>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
