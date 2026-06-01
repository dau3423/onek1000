import type { Metadata } from 'next';
import Link from 'next/link';
import { BUSINESS_INFO } from '@/lib/business';

export const metadata: Metadata = {
  title: '사업자 정보 - 1000냥 주유소',
  description: '1000냥 주유소 운영 사업자 정보 및 통신판매업 신고 정보',
};

export default function BusinessInfoPage() {
  return (
    <>
      <h1>사업자 정보</h1>
      <p className="text-gray-500">
        「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 다음과 같이 사업자 정보를 표시합니다.
      </p>

      <h2>운영 사업자</h2>
      <ul>
        <li>상호: {BUSINESS_INFO.name}</li>
        <li>대표자: {BUSINESS_INFO.owner}</li>
        <li>사업자등록번호: {BUSINESS_INFO.registrationNumber}</li>
        <li>통신판매업 신고번호: {BUSINESS_INFO.ecommerceNumber}</li>
        <li>사업장 주소: {BUSINESS_INFO.address}</li>
      </ul>

      <h2>연락처</h2>
      <ul>
        <li>고객센터: {BUSINESS_INFO.phone}</li>
        <li>이메일: {BUSINESS_INFO.email}</li>
      </ul>

      <h2>호스팅 제공자</h2>
      <ul>
        <li>Google Firebase (App Hosting)</li>
      </ul>

      <h2>서비스 제공 시기</h2>
      <p>
        유료 구독(1000냥 플랜)은 온라인 디지털 서비스로, 별도 배송 없이 <strong>결제 완료 즉시 이용</strong>할 수 있습니다.
        1개월권(단건)은 결제 즉시 이용을 시작하여 1개월(30일) 후 만료되며, 정기 구독은 가입 즉시 7일 무료 체험이 시작되어
        체험 종료 후 매월 자동 갱신됩니다. 자세한 사항은{' '}
        <Link href="/legal/payment" className="text-primary underline">유료 결제 이용약관 제2조(서비스 제공 시기)</Link>
        에서 확인하실 수 있습니다.
      </p>

      <h2>취소·환불 정책</h2>
      <p>
        유료 구독(1000냥 플랜)의 결제, 정기결제, 청약철회 및 취소·환불에 관한 사항은{' '}
        <Link href="/legal/payment#refund" className="text-primary underline">취소·환불 정책(유료 결제 이용약관 제4조)</Link>
        에서 확인하실 수 있습니다.
      </p>
    </>
  );
}
