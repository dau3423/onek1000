import Link from 'next/link';
import { BUSINESS_INFO } from '@/lib/business';

// 메인(홈) 하단 사업자 정보 푸터.
// 카드사 심사가 "메인 페이지 하단 사업자 정보"로 진행되므로, 필수 항목을 텍스트로 명시한다.
// 필수 표기: 상호/대표자/사업장주소/사업자등록번호/대표전화/대표이메일(+통신판매업번호).
export function BusinessFooter() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 px-6 py-8 text-xs leading-relaxed text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
      <div className="mx-auto max-w-3xl space-y-3">
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">사업자 정보</p>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">상호명</dt>
            <dd>{BUSINESS_INFO.name}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">대표자명</dt>
            <dd>{BUSINESS_INFO.owner}</dd>
          </div>
          <div className="flex gap-1 sm:col-span-2">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">사업장주소</dt>
            <dd>{BUSINESS_INFO.address}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">사업자등록번호</dt>
            <dd>{BUSINESS_INFO.registrationNumber}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">통신판매업 신고번호</dt>
            <dd>{BUSINESS_INFO.ecommerceNumber}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">대표전화번호</dt>
            <dd>
              <a href={`tel:${BUSINESS_INFO.phone}`} className="hover:underline">{BUSINESS_INFO.phone}</a>
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-600 dark:text-gray-300">대표이메일</dt>
            <dd>
              <a href={`mailto:${BUSINESS_INFO.email}`} className="hover:underline">{BUSINESS_INFO.email}</a>
            </dd>
          </div>
        </dl>

        <nav className="flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-200 pt-4 text-gray-400 dark:border-gray-800">
          <Link href="/legal/terms" className="hover:underline">이용약관</Link>
          <Link href="/legal/privacy" className="hover:underline">개인정보처리방침</Link>
          <Link href="/legal/payment" className="hover:underline">유료 결제 이용약관</Link>
        </nav>

        {/* 오피넷 출처 표기 (SRS §데이터 출처) */}
        <p className="text-gray-400">
          유가 정보 출처: 한국석유공사 오피넷(Opinet)
        </p>
        <p className="text-gray-400">
          © {new Date().getFullYear()} {BUSINESS_INFO.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
