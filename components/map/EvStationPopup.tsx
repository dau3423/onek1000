'use client';

import { useEffect, useRef } from 'react';
import type { EvStationMarker } from '@/types/ev';
import { relativeFromNow } from '@/lib/ev/format';

interface Props {
  station: EvStationMarker;
  onClose: () => void;
  /** "상세보기" — 충전소 상세(/ev/{statId})로 이동 */
  onDetail: () => void;
  /** "길안내" — 카카오내비 확인 모달 요청 */
  onNavigate: () => void;
}

/**
 * PC(데스크톱)에서 충전소 마커 클릭 시 노출하는 요약 정보 카드 모달.
 * StationPopup(주유소)과 톤을 맞추되, 가격 대신 사용가능/전체 충전기·급속/완속·운영기관·최근 갱신을 보여준다.
 */
export function EvStationPopup({ station, onClose, onDetail, onNavigate }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    cardRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const available = station.availableChargers > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${station.name} 정보`}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl outline-none dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400" aria-hidden>⚡ 전기차 충전소</span>
            </div>
            <h2 className="mt-1 truncate text-base font-bold text-gray-900 dark:text-gray-50">
              {station.name}
            </h2>
            {station.busiNm && (
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{station.busiNm}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">사용 가능</span>
            <span className={`text-2xl font-extrabold ${available ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {station.availableChargers}
              <span className="ml-1 text-sm font-medium text-gray-400 dark:text-gray-500">/ {station.totalChargers}대</span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {station.hasFast && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">급속</span>
            )}
            {station.hasSlow && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">완속</span>
            )}
            {station.maxOutput != null && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">최대 {station.maxOutput}kW</span>
            )}
          </div>
          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            상태 갱신 {relativeFromNow(station.latestStatUpdAt)}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onNavigate}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            길안내
          </button>
          <button
            onClick={onDetail}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md hover:bg-primary-dark"
          >
            상세보기
          </button>
        </div>
      </div>
    </div>
  );
}
