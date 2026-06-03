import Link from 'next/link';
import { notFound } from 'next/navigation';
import { queryEvStationDetail } from '@/lib/db/ev';
import { NaviButton } from '@/components/station/NaviButton';
import { EvChargerStatusPanel } from '@/components/ev/EvChargerStatusPanel';
import type { EvStationDetail } from '@/types/ev';

interface Props { params: { statId: string } }

// 진입 시엔 우리 DB만으로 즉시 렌더(외부 호출 없음 → 빠름). 라이브 갱신은 충전기 현황의 새로고침 버튼으로만.
// 충전기 상태는 자주 바뀌므로 캐시는 하지 않는다(DB 조회만 수행).
export const dynamic = 'force-dynamic';

export default async function EvStationDetailPage({ params }: Props) {
  // 진입은 DB 스냅샷으로 즉시 표시. 외부(data.go.kr) 호출은 하지 않는다(빠른 진입).
  // 실시간 갱신은 EvChargerStatusPanel의 "새로고침" 버튼 → POST /api/ev/[statId]에서만.
  let detail: EvStationDetail | null = null;
  try {
    detail = await queryEvStationDetail(params.statId);
  } catch {
    detail = null;
  }
  if (!detail) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white dark:bg-gray-950">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
          ←
        </Link>
        <h1 className="flex-1 truncate font-bold text-gray-900 dark:text-gray-50">{detail.name}</h1>
      </header>

      {/* 운영기관 + 주소 */}
      <section className="px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400" aria-hidden>⚡ 전기차 충전소</span>
        </div>
        {detail.busiNm && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">🏢 {detail.busiNm}</p>}
        {detail.address && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">📍 {detail.address}</p>}
        {detail.busiCall && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">📞 {detail.busiCall}</p>}
        {detail.useTime && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">🕒 {detail.useTime}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {detail.hasFast && (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">급속</span>
          )}
          {detail.hasSlow && (
            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">완속</span>
          )}
          {detail.parkingFree === true && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">주차무료</span>
          )}
        </div>
      </section>

      {/* 충전기 현황 + 충전기 목록 (클라이언트: 새로고침 버튼으로만 라이브 갱신) */}
      <EvChargerStatusPanel
        statId={detail.statId}
        initial={{
          totalChargers: detail.totalChargers,
          availableChargers: detail.availableChargers,
          syncedAt: detail.syncedAt,
          chargers: detail.chargers,
        }}
      />

      {/* CTA */}
      <section className="mt-auto space-y-2 border-t border-gray-100 bg-gray-50 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] dark:border-gray-800 dark:bg-gray-900">
        <NaviButton name={detail.name} lat={detail.lat} lng={detail.lng} />
        {detail.busiCall && (
          <a
            href={`tel:${detail.busiCall}`}
            className="block w-full rounded-xl border border-gray-200 bg-white py-3.5 text-center font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            ☎ 운영기관 전화
          </a>
        )}
      </section>

      <footer className="border-t border-gray-100 bg-white px-5 py-3 text-center text-[10px] text-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-500">
        충전소 정보 제공: 한국환경공단(공공데이터포털) · 충전기 상태는 새로고침 버튼으로 실시간 갱신됩니다.
      </footer>
    </main>
  );
}
