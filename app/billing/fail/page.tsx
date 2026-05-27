import Link from 'next/link';

export default function BillingFailPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-5xl">💳</div>
      <h1 className="text-xl font-bold">결제가 취소됐어요</h1>
      <p className="text-sm text-gray-500">결제는 진행되지 않았습니다. 언제든지 다시 시도하실 수 있어요.</p>
      <Link href="/pricing" className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
        다시 시도
      </Link>
    </main>
  );
}
