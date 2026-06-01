import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { CancelButton } from '@/components/billing/CancelButton';
import { SignOutButton } from '@/components/SignOutButton';
import { EnablePushButton } from '@/components/push/EnablePushButton';
import { ProfileHeader } from '@/components/profile/ProfileHeader';

interface Sub {
  id: string;
  status: string;
  plan: string;
  plan_type: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  expires_at: string | null;
  next_charge_at: string | null;
  canceled_at: string | null;
}

export default async function MyPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/sign-in?callbackUrl=/my');

  let sub: Sub | null = null;
  let favCount = 0;
  let vehicleCount = 0;
  let regionCount = 0;
  let nickname: string | null = session.user.nickname ?? null;
  let image: string | null = session.user.image ?? null;

  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data: user } = await sb
      .from('users')
      .select('id, nickname, image_url')
      .eq('email', session.user.email)
      .maybeSingle();
    if (user) {
      nickname = (user.nickname as string | null) ?? nickname;
      image = (user.image_url as string | null) ?? image;
      const { data: s } = await sb
        .from('subscriptions')
        .select('id, status, plan, plan_type, current_period_end, trial_end, expires_at, next_charge_at, canceled_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sub = s as Sub | null;
      const [{ count: favC }, { count: vehC }, { count: regC }] = await Promise.all([
        sb.from('favorites').select('station_id', { count: 'exact', head: true }).eq('user_id', user.id),
        sb.from('vehicles').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        sb.from('interest_regions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      favCount = favC ?? 0;
      vehicleCount = vehC ?? 0;
      regionCount = regC ?? 0;
    }
  }

  const isOnetime = sub?.plan_type === 'onetime';
  const periodEnd = sub?.expires_at ?? sub?.current_period_end ?? sub?.trial_end;
  const periodEndValid = periodEnd ? new Date(periodEnd).getTime() > Date.now() : false;
  const periodEndStr = periodEnd ? new Date(periodEnd).toLocaleDateString('ko-KR') : null;
  // 정기(trial/active)는 항상, canceled여도 만료 전이면 프리미엄 유지
  const isActive =
    sub?.status === 'active' ||
    sub?.status === 'trial' ||
    (sub?.status === 'canceled' && periodEndValid);
  const isCanceled = sub?.status === 'canceled';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="font-bold text-gray-900">마이페이지</h1>
      </header>

      <section className="px-5 py-5">
        <ProfileHeader
          initialImage={image}
          initialNickname={nickname}
          fallbackName={session.user.name}
          email={session.user.email}
        />
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">구독</h2>
        {sub && isActive ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-white">
                {sub.status === 'trial'
                  ? '무료 체험 중'
                  : isOnetime
                    ? '1개월권'
                    : isCanceled
                      ? '해지 예정'
                      : '정기 구독'}
              </span>
              <span className="text-xs text-gray-500">{isOnetime ? '₩1,000 / 1개월' : '월 ₩1,000'}</span>
            </div>
            <div className="mt-3 text-sm text-gray-700">
              {isOnetime || isCanceled ? '이용 만료' : '다음 결제'}: <strong>{periodEndStr ?? '-'}</strong>
            </div>
            {/* 단건/해지건은 끊을 자동결제가 없으므로 해지 버튼 미노출 */}
            {!isOnetime && !isCanceled && (
              <div className="mt-4">
                <CancelButton />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm text-gray-700">현재 무료 플랜이에요.</div>
            <Link
              href="/pricing"
              className="mt-3 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-bold text-white"
            >
              ₩1,000으로 광고 끄기 →
            </Link>
          </div>
        )}
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">즐겨찾기</h2>
        <Link href="/my/favorites" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="text-sm text-gray-700">♡ 저장한 주유소</span>
          <span className="text-sm font-bold text-gray-900">{favCount}개</span>
        </Link>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">내 차량</h2>
        <Link href="/my/vehicles" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="text-sm text-gray-700">🚗 차량 / 기름 종류</span>
          {vehicleCount > 0 ? (
            <span className="text-sm font-bold text-gray-900">{vehicleCount}개</span>
          ) : (
            <span className="text-sm text-primary">관리 →</span>
          )}
        </Link>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">관심 지역</h2>
        <Link href="/my/interest-regions" className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <span className="text-sm text-gray-700">📍 관심 지역 최저가 알림</span>
          {regionCount > 0 ? (
            <span className="text-sm font-bold text-gray-900">{regionCount}개</span>
          ) : (
            <span className="text-sm text-primary">관리 →</span>
          )}
        </Link>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">알림</h2>
        <EnablePushButton />
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">지원</h2>
        <a
          href="mailto:junicode0901@gmail.com?subject=%5B1000%EB%83%A5%20%EC%A3%BC%EC%9C%A0%EC%86%8C%5D%20%EB%AC%B8%EC%9D%98"
          className="flex items-center justify-between rounded-xl bg-gray-50 p-4"
        >
          <span className="text-sm text-gray-700">✉️ 문의하기</span>
          <span className="text-sm text-primary">이메일 보내기 →</span>
        </a>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-gray-400">
          <Link href="/legal/terms" className="hover:underline">이용약관</Link>
          <Link href="/legal/privacy" className="hover:underline">개인정보처리방침</Link>
          <Link href="/legal/payment" className="hover:underline">유료 결제 이용약관</Link>
          <Link href="/legal/business" className="hover:underline">사업자 정보</Link>
        </div>
      </section>

      <section className="mt-auto border-t border-gray-100 px-5 py-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <SignOutButton />
      </section>
    </main>
  );
}
