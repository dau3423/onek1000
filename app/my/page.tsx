import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { CancelButton } from '@/components/billing/CancelButton';
import { SignOutButton } from '@/components/SignOutButton';
import { EnablePushButton } from '@/components/push/EnablePushButton';

interface Sub {
  id: string;
  status: string;
  plan: string;
  current_period_end: string | null;
  trial_end: string | null;
  next_charge_at: string | null;
  canceled_at: string | null;
}

export default async function MyPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/sign-in?callbackUrl=/my');

  let sub: Sub | null = null;
  let favCount = 0;

  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data: user } = await sb
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .maybeSingle();
    if (user) {
      const { data: s } = await sb
        .from('subscriptions')
        .select('id, status, plan, current_period_end, trial_end, next_charge_at, canceled_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sub = s as Sub | null;
      const { count } = await sb
        .from('favorites')
        .select('station_id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      favCount = count ?? 0;
    }
  }

  const periodEnd = sub?.current_period_end ?? sub?.trial_end;
  const periodEndStr = periodEnd ? new Date(periodEnd).toLocaleDateString('ko-KR') : null;
  const isActive = sub?.status === 'active' || sub?.status === 'trial';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="font-bold text-gray-900">마이페이지</h1>
      </header>

      <section className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">👤</div>
          <div>
            <div className="font-bold text-gray-900">{session.user.name ?? '회원'}</div>
            <div className="text-xs text-gray-500">{session.user.email}</div>
          </div>
        </div>
      </section>

      <section className="border-t border-gray-100 px-5 py-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">구독</h2>
        {sub && isActive ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-white">
                {sub.status === 'trial' ? '무료 체험 중' : '1000냥 플랜'}
              </span>
              <span className="text-xs text-gray-500">월 ₩1,000</span>
            </div>
            <div className="mt-3 text-sm text-gray-700">
              다음 결제: <strong>{periodEndStr ?? '-'}</strong>
            </div>
            <div className="mt-4">
              <CancelButton />
            </div>
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
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">알림</h2>
        <EnablePushButton />
      </section>

      <section className="mt-auto border-t border-gray-100 px-5 py-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <SignOutButton />
      </section>
    </main>
  );
}
