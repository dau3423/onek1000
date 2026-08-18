'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BUSINESS_INFO } from '@/lib/business';
import { REGIONS } from '@/lib/regions';

// 메인(홈) 하단 사업자 정보 푸터.
// 카드사 심사가 "메인 페이지 하단 사업자 정보"로 진행되므로, 필수 항목을 텍스트로 명시한다.
// 필수 표기: 상호/대표자/사업장주소/사업자등록번호/대표전화/대표이메일(+통신판매업번호).
//
// 지역별 최저가 링크도 여기에 둔다 — /regions 서브트리(시도 17 + 시군구 211 = 216 URL)로 들어가는
// 내부 링크가 그 서브트리 안에만 있어, 구글이 "사이트맵에만 있고 아무도 링크하지 않는 페이지"로 보고
// 크롤 순번을 계속 미뤘다(GSC "발견됨 - 현재 색인이 생성되지 않음" 101건). 홈은 가장 자주 크롤되는
// 페이지라 여기서 시도로 링크가 나가면 그 아래 시군구까지 크롤 경로가 뚫린다.
// 부수 효과로 사용자 동선도 생긴다 — 그전까지 지역 페이지는 검색 유입 외에 도달 경로가 없었다.
//
// 라벨(상호명/대표자명/…)은 번역한다. 값(BUSINESS_INFO.*)·지역명·법정 문서 링크 텍스트·오피넷
// 출처 표기는 아래 각 자리에서 i18n-ignore로 한국어를 유지한다(§i18n 최종 리뷰 C1 조치).
export function BusinessFooter() {
  const t = useTranslations('footer');
  return (
    <footer className="border-t border-gray-200 bg-gray-50 px-6 py-8 text-xs leading-relaxed text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
      <div className="mx-auto max-w-3xl space-y-3">
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{t('businessInfoHeading')}</p>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">{t('nameLabel')}</dt>
            {/* i18n-ignore: 사업자등록증 원문 상호명 — 등록된 표기 그대로 노출해야 하는 법정 고지값이라 번역하지 않는다. */}
            <dd>{BUSINESS_INFO.name}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">{t('ownerLabel')}</dt>
            {/* i18n-ignore: 사업자등록증 원문 대표자명 — 법정 고지값이라 번역하지 않는다. */}
            <dd>{BUSINESS_INFO.owner}</dd>
          </div>
          <div className="flex gap-1 sm:col-span-2">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">{t('addressLabel')}</dt>
            {/* i18n-ignore: 사업자등록증 원문 사업장주소 — 법정 고지값이라 번역하지 않는다. */}
            <dd>{BUSINESS_INFO.address}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">{t('registrationNumberLabel')}</dt>
            {/* i18n-ignore: 사업자등록번호 — 법정 고지값(숫자·기호)이라 번역 대상이 아니다. */}
            <dd>{BUSINESS_INFO.registrationNumber}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">{t('ecommerceNumberLabel')}</dt>
            {/* i18n-ignore: 통신판매업 신고번호 — 법정 고지값(숫자·기호)이라 번역 대상이 아니다. */}
            <dd>{BUSINESS_INFO.ecommerceNumber}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">{t('phoneLabel')}</dt>
            <dd>
              <a href={`tel:${BUSINESS_INFO.phone}`} className="hover:underline">{BUSINESS_INFO.phone}</a>
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">{t('emailLabel')}</dt>
            <dd>
              <a href={`mailto:${BUSINESS_INFO.email}`} className="hover:underline">{BUSINESS_INFO.email}</a>
            </dd>
          </div>
        </dl>

        {/* 지역별 최저가 — 시도 17개. 시군구는 각 시도 페이지가 링크한다(깊이 2).
            /regions 서브트리는 한국어 전용(SSG, 국제화 대상 밖)이라 링크 라벨을 번역하면
            실제로 없는 영문 콘텐츠를 약속하게 된다 — 라벨·지역명 모두 한국어로 유지한다. */}
        <nav
          // i18n-ignore: /regions는 한국어 전용 페이지라 라벨을 번역하지 않는다(위 설명 참고).
          aria-label="지역별 최저가"
          className="border-t border-gray-200 pt-4 dark:border-gray-800"
        >
          <Link
            href="/regions"
            className="text-xs font-bold text-gray-600 hover:underline dark:text-gray-300"
          >
            {/* i18n-ignore: /regions는 한국어 전용 페이지라 라벨을 번역하지 않는다(위 nav 설명 참고). */}
            지역별 최저가
          </Link>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
            {REGIONS.map((r) => (
              <Link key={r.code} href={`/regions/${r.slug}`} className="hover:underline">
                {r.name}
              </Link>
            ))}
          </div>
        </nav>

        <nav className="flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-200 pt-4 text-gray-400 dark:border-gray-800">
          {/* i18n-ignore: /legal/terms 문서 자체가 한국어 전용(국제화 대상 밖)이라 링크 텍스트를 번역하지 않는다. */}
          <Link href="/legal/terms" className="hover:underline">이용약관</Link>
          {/* i18n-ignore: /legal/privacy 문서 자체가 한국어 전용(국제화 대상 밖)이라 링크 텍스트를 번역하지 않는다. */}
          <Link href="/legal/privacy" className="hover:underline">개인정보처리방침</Link>
          {/* i18n-ignore: /legal/payment 문서 자체가 한국어 전용(국제화 대상 밖)이라 링크 텍스트를 번역하지 않는다. */}
          <Link href="/legal/payment" className="hover:underline">유료 결제 이용약관</Link>
        </nav>

        {/* 오피넷 출처 표기 (SRS §데이터 출처) */}
        <p className="text-gray-400">
          {/* i18n-ignore: 유가 데이터 출처(한국석유공사 오피넷) 표기 — 기관 고유명사라 번역하지 않는다. */}
          유가 정보 출처: 한국석유공사 오피넷(Opinet)
        </p>
        <p className="text-gray-400">
          © {new Date().getFullYear()} {BUSINESS_INFO.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
