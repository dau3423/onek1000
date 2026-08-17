'use client';

// 내비 앱 선택 UI 공용 컴포넌트.
// NaviConfirm(모달 내부 인라인 목록)과 NaviButton(단독 선택 시트)이 함께 쓴다.
// 앱 로고는 상표권 문제로 넣지 않고 텍스트 + 공용 인라인 아이콘만 사용한다.

import { useTranslations } from 'next-intl';
import {
  availableNaviProviders,
  type NaviProvider,
  NAVI_PROVIDER_LABEL,
} from '@/lib/map/navi';
import { MapIcon, RouteIcon, PinIcon, ChevronRightIcon } from '@/components/icons';

/** 앱별 아이콘(브랜드 로고 아님 — 스캔용 구분 목적의 중립 아이콘) */
function providerIcon(provider: NaviProvider) {
  const cls = 'h-5 w-5';
  switch (provider) {
    case 'kakao':
      return <MapIcon className={cls} />;
    case 'tmap':
      return <RouteIcon className={cls} />;
    case 'naver':
      return <PinIcon className={cls} />;
  }
}

interface NaviAppButtonsProps {
  onPick: (provider: NaviProvider) => void;
  disabled?: boolean;
}

/** 실행 가능한 내비 앱들을 목록 버튼으로 렌더. 선택 시 onPick 호출. */
export function NaviAppButtons({ onPick, disabled }: NaviAppButtonsProps) {
  const t = useTranslations('station.navi');
  const providers = availableNaviProviders();
  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => onPick(provider)}
          disabled={disabled}
          className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          <span className="text-gray-500 dark:text-gray-400">{providerIcon(provider)}</span>
          <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-50">
            {t('withProvider', { provider: NAVI_PROVIDER_LABEL[provider] })}
          </span>
          <ChevronRightIcon className="h-4 w-4 text-gray-400" />
        </button>
      ))}
    </div>
  );
}

interface NaviAppPickerProps {
  /** 상단 제목(선택 시트 헤더) */
  title?: string;
  /** 보조 설명(도착지 이름 등) */
  subtitle?: string;
  onPick: (provider: NaviProvider) => void;
  onClose: () => void;
  disabled?: boolean;
}

/**
 * 단독 앱 선택 시트(바텀 시트 모달). NaviButton처럼 확인 단계 없이 바로 앱을 고를 때 쓴다.
 */
export function NaviAppPicker({ title, subtitle, onPick, onClose, disabled }: NaviAppPickerProps) {
  const t = useTranslations('station.navi');
  const tCommon = useTranslations('common');
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('pickerAria')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-900 sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold text-gray-900 dark:text-gray-50">
          {title ?? t('whichApp')}
        </p>
        {subtitle ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
        <div className="mt-4">
          <NaviAppButtons onPick={onPick} disabled={disabled} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
          {t('appHint')}
        </p>
        <button
          type="button"
          onClick={onClose}
          disabled={disabled}
          className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {tCommon('cancel')}
        </button>
      </div>
    </div>
  );
}
