import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { InterestRegionManager } from '@/components/interest/InterestRegionManager';

// [관심지역 비활성] 위치 좌표 저장 중단으로 이 라우트를 막는다(직접 URL 접근도 마이페이지로 리다이렉트).
// 되살리려면: 아래 redirect('/my') 한 줄을 지우고, 그 아래 원래 렌더 블록(현재 _disabledRender)을 환원하면 됨.
// (InterestRegionManager / api(GET) / types / 마이그레이션 0005 는 그대로 유지)
export default async function InterestRegionsPage() {
  redirect('/my');
}

async function _disabledRender() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/sign-in?callbackUrl=/my/interest-regions');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <Link href="/my" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="font-bold text-gray-900">관심 지역 알림</h1>
      </header>

      <section className="px-5 py-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <InterestRegionManager />
      </section>
    </main>
  );
}
