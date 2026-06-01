// 결제 완료 결과 페이지. 승인은 /api/billing/return(S2S)에서 이미 확정됨.
// 이 페이지는 결과 안내만 담당하고 마이페이지로 이동시킨다.
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function BillingSuccessPage({
  searchParams,
}: {
  searchParams: { status?: string; plan?: string };
}) {
  // 비정상 진입(직접 GET 등)은 결제 실패로 안내
  if (searchParams.status !== 'ok') redirect('/pricing');

  const isOnetime = searchParams.plan === 'onetime_1000';

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-5xl">🎉</div>
      <h1 className="text-xl font-bold">1000냥 시작!</h1>
      <p className="text-sm text-gray-500">
        {isOnetime
          ? '결제가 완료됐어요. 지금부터 1개월간 광고 없이 이용하실 수 있어요.'
          : '7일 무료 체험이 시작됐어요. 체험 종료 후 매월 ₩1,000이 자동결제됩니다.'}
      </p>
      <Link href="/my" className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
        마이페이지로 이동
      </Link>
    </main>
  );
}
