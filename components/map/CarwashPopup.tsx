'use client';

import { useEffect, useRef } from 'react';
import type { CarwashMarker, WashType } from '@/types/carwash';
import { WASH_TYPE_LABEL } from '@/types/carwash';
import { CloseIcon, PinIcon, PhoneIcon, ClockIcon, CoinIcon } from '@/components/icons';

interface Props {
  place: CarwashMarker;
  onClose: () => void;
  /** "길안내" — 카카오내비 확인 모달 요청 */
  onNavigate: () => void;
}

/**
 * 유형별 뱃지 글리프(currentColor, viewBox 0 0 24 24) — 마커(carwashMarker.ts)와 동일한
 * 물방울/스펀지·거품/기어/? 형태로 맞춰 마커·범례·팝업의 시각 일관성을 유지(design §2-4).
 */
const TYPE_GLYPH: Record<WashType, React.ReactNode> = {
  self: <path d="M12 4c2.6 3.4 4.5 5.8 4.5 8.2a4.5 4.5 0 0 1-9 0C7.5 9.8 9.4 7.4 12 4z" />,
  hand: (
    <>
      <rect x="6.5" y="10.5" width="11" height="7" rx="1.6" />
      <circle cx="9" cy="7.6" r="1.3" />
      <circle cx="12.5" cy="6.4" r="1.6" />
      <circle cx="16" cy="7.9" r="1.2" />
    </>
  ),
  auto: (
    <>
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="12" cy="12" r="1.7" />
      <rect x="11" y="4.2" width="2" height="2.6" />
      <rect x="11" y="17.2" width="2" height="2.6" />
      <rect x="4.2" y="11" width="2.6" height="2" />
      <rect x="17.2" y="11" width="2.6" height="2" />
    </>
  ),
  unknown: (
    <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="800">?</text>
  ),
};

// 유형 뱃지 색(라이트/다크 페어, design §4). 색 단독 금지 — 라벨 텍스트와 병기.
const BADGE_CLASS: Record<WashType, string> = {
  self: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  hand: 'bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800',
  auto: 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
  unknown: 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

/** 조건부 정보 행 — 값이 있을 때만 라벨째 렌더(AC-2.3/2.4). */
function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
      <span className="mt-0.5 shrink-0 text-gray-400">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/**
 * 세차장 마커 클릭 시 노출하는 요약 정보 카드(모바일=하단 시트 / 데스크톱=중앙 카드).
 * EvStationPopup 패턴을 따르되 필드는 세차장용(유형 뱃지·조건부 운영/요금·단일 CTA·출처 고지)으로 교체.
 * 상세 페이지가 없어(plan Out) 팝업이 종착점이며, CTA는 길안내 단독이다.
 */
export function CarwashPopup({ place, onClose, onNavigate }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    cardRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const address = place.roadAddr ?? place.jibunAddr ?? null;
  const hours = place.weekdayOpen
    ? place.weekdayClose
      ? `평일 ${place.weekdayOpen}~${place.weekdayClose}`
      : `평일 ${place.weekdayOpen}`
    : null;
  const fee = place.feeInfo ?? null;
  const tel = place.tel ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 세차장 정보`}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="w-full rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl outline-none dark:bg-gray-900 sm:max-w-sm sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${BADGE_CLASS[place.washType]}`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                {TYPE_GLYPH[place.washType]}
              </svg>
              {WASH_TYPE_LABEL[place.washType]}
            </span>
            <h2 className="mt-1.5 truncate text-base font-bold text-gray-900 dark:text-gray-50">
              {place.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* 정보 — 값이 있는 항목만 라벨째 렌더(undefined/null/빈문자 노출 금지) */}
        <div className="mt-3 space-y-2">
          {address && (
            <InfoRow icon={<PinIcon className="h-4 w-4" />}>{address}</InfoRow>
          )}
          {tel && (
            <InfoRow icon={<PhoneIcon className="h-4 w-4" />}>
              <a href={`tel:${tel}`} className="text-primary hover:underline">{tel}</a>
            </InfoRow>
          )}
          {hours && (
            <InfoRow icon={<ClockIcon className="h-4 w-4" />}>{hours}</InfoRow>
          )}
          {fee && (
            <InfoRow icon={<CoinIcon className="h-4 w-4" />}>{fee}</InfoRow>
          )}
        </div>

        {/* CTA — 길안내 단독(상세 페이지 없음) */}
        <button
          onClick={onNavigate}
          className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary-dark"
        >
          길안내
        </button>

        {/* 정보 노후 고지 + 출처(AC-2.6·2.8) */}
        <p className="mt-3 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
          공공데이터 기준이라 실제와 다를 수 있어요(폐업·정보 변경 가능) · 출처: 행정안전부 전국세차장표준데이터
        </p>
      </div>
    </div>
  );
}
