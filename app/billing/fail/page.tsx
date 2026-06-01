// 결제 실패/취소 결과 페이지. (returnUrl 승인 실패 또는 사용자 취소 시 진입)
import Link from 'next/link';

const REASON_LABEL: Record<string, string> = {
  parse: '결제 결과를 읽지 못했어요.',
  missing: '결제 인증 정보가 누락됐어요.',
  unconfigured: '결제 시스템이 아직 설정되지 않았어요.',
  nouser: '회원 정보를 찾을 수 없어요.',
  unknown_order: '알 수 없는 주문이에요.',
  user_mismatch: '주문한 회원과 로그인 정보가 달라요.',
  bad_plan: '잘못된 요금제예요.',
  approve_error: '결제 승인 중 오류가 발생했어요.',
  no_billkey: '정기결제 등록(빌링키 발급)에 실패했어요.',
  db: '결제 처리 중 오류가 발생했어요.',
};

export default function BillingFailPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const reason = searchParams.reason;
  const detail = reason ? REASON_LABEL[reason] : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-5xl">💳</div>
      <h1 className="text-xl font-bold">결제가 완료되지 않았어요</h1>
      <p className="text-sm text-gray-500">
        {detail ?? '결제는 진행되지 않았습니다. 언제든지 다시 시도하실 수 있어요.'}
      </p>
      <Link href="/pricing" className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
        다시 시도
      </Link>
    </main>
  );
}
