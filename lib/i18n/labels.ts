'use client';

// 코드 → 표시 라벨. 클라이언트 컴포넌트 전용 훅이다.
// 서버 컴포넌트에서는 getTranslations('labels') 후 t(`product.${code}`) 를 직접 호출한다.
//
// ⚠️ types/station.ts 의 PRODUCT_LABEL·BRAND_LABEL·SIDO_NAME 은 제거하지 않는다.
//    번역 대상이 아닌 /regions/*(한국어 SSG)와 lib/regions.ts 가 그 상수를 쓴다.
//    상수 = SSG 페이지의 한국어 원본, 카탈로그 = (intl) 화면의 원본. 역할이 다르다.
//    두 값의 일치는 scripts/i18n-check.mjs 가 검사한다.
import { useTranslations } from 'next-intl';
import type { ProductCode, BrandCode, SidoCode } from '@/types/station';
import type { WashType } from '@/types/carwash';

export function useProductLabel(): (code: ProductCode) => string {
  const t = useTranslations('labels.product');
  return (code) => t(code);
}

export function useBrandLabel(): (code: BrandCode) => string {
  const t = useTranslations('labels.brand');
  return (code) => t(code);
}

export function useSidoLabel(): (code: SidoCode) => string {
  const t = useTranslations('labels.sido');
  return (code) => t(code);
}

export function useWashTypeLabel(): (type: WashType) => string {
  const t = useTranslations('labels.washType');
  return (type) => t(type);
}
