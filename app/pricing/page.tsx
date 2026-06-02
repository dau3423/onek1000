import Link from 'next/link';
import { SubscribeButton } from '@/components/billing/SubscribeButton';
import { BUSINESS_INFO } from '@/lib/business';

export default function PricingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="font-bold text-gray-900">1000냥 플랜</h1>
      </header>

      <section className="bg-gradient-to-b from-primary/10 to-white px-6 py-10 text-center">
        <div className="text-4xl">💸</div>
        <h2 className="mt-3 text-2xl font-extrabold text-gray-900">광고 없이 깔끔하게</h2>
        <p className="mt-4 text-4xl font-black text-primary">₩1,000</p>
        <p className="mt-1 text-xs text-gray-500">정기 7일 무료 체험 · 1개월권 단건 결제 · 언제든 해지 가능</p>
      </section>

      <section className="px-6 pb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="py-2 font-medium">기능</th>
              <th className="py-2 text-center font-medium">무료</th>
              <th className="py-2 text-center font-bold text-primary">1000냥 ✨</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <Row name="지도 가격 정보" free pro />
            <Row name="1km 알람" free pro />
            <Row name="주유소 상세" free pro />
            <Row name="배너 광고" freeText="포함" proText="없음" />
            <Row name="전면 광고 (일 1회)" freeText="포함" proText="없음" />
            <Row name="즐겨찾기 동기화" pro />
            <Row name="가격 변동 푸시*" pro />
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-gray-400">* 푸시 알림은 베타 단계에서 출시 예정</p>
      </section>

      <section className="px-6 pb-6">
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
          <p className="font-semibold text-gray-800">서비스 제공 시기: 결제 완료 즉시 이용 가능</p>
          <p className="mt-1 text-gray-500">
            온라인 디지털 서비스로, 별도 배송 없이 결제 완료 즉시 자동으로 적용됩니다.
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-gray-500">
            <li>1개월권(단건): 결제 즉시 이용, 이용 기간 1개월(30일) 후 만료</li>
            <li>정기 구독: 7일 무료 체험 즉시 시작 → 체험 종료 후 첫 결제, 매월 자동 갱신</li>
          </ul>
        </div>
      </section>

      <section className="mt-auto space-y-2 border-t border-gray-100 bg-gray-50 px-6 py-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <SubscribeButton />
        <p className="text-center text-[11px] text-gray-500">
          정기: 7일 무료 후 매월 ₩1,000 자동결제 · 1개월권: ₩1,000 단건(1개월 후 만료) · 결제 KG이니시스
        </p>
        <p className="text-center text-[11px] text-gray-400">
          결제 진행 시{' '}
          <Link href="/legal/payment" className="underline">유료 결제 이용약관</Link>
          에 동의하게 됩니다.
        </p>
        <div className="flex justify-center gap-4 text-[11px] text-gray-400">
          <Link href="/legal/payment#refund" className="underline">취소·환불 정책</Link>
          <Link href="/legal/business" className="underline">사업자 정보</Link>
        </div>

        <div className="mt-2 space-y-0.5 border-t border-gray-200 pt-3 text-[10px] leading-relaxed text-gray-400">
          <p>상호: {BUSINESS_INFO.name} · 대표자: {BUSINESS_INFO.owner}</p>
          <p>사업자등록번호: {BUSINESS_INFO.registrationNumber}</p>
          <p>통신판매업 신고번호: {BUSINESS_INFO.ecommerceNumber}</p>
          <p>주소: {BUSINESS_INFO.address}</p>
          <p>고객센터: {BUSINESS_INFO.phone} · 이메일: {BUSINESS_INFO.email}</p>
        </div>
      </section>
    </main>
  );
}

interface RowProps {
  name: string;
  free?: boolean;
  pro?: boolean;
  freeText?: string;
  proText?: string;
}

function Row({ name, free, pro, freeText, proText }: RowProps) {
  return (
    <tr>
      <td className="py-3 text-gray-700">{name}</td>
      <td className="py-3 text-center text-gray-500">
        {freeText ?? (free ? '✓' : '—')}
      </td>
      <td className="py-3 text-center font-semibold text-primary">
        {proText ?? (pro ? '✓' : '—')}
      </td>
    </tr>
  );
}
