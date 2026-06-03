import Link from 'next/link';
import { notFound } from 'next/navigation';
import { queryEvStationDetail } from '@/lib/db/ev';
import { NaviButton } from '@/components/station/NaviButton';
import { relativeFromNow } from '@/lib/ev/format';
import {
  chargerTypeLabel,
  chargerStatLabel,
  chargerStatTone,
  chargerSpeed,
  type EvStationDetail,
} from '@/types/ev';

interface Props { params: { statId: string } }

const TONE_CLASS: Record<'available' | 'busy' | 'off', string> = {
  available: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  busy: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  off: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
};

export default async function EvStationDetailPage({ params }: Props) {
  // 상세는 우리 DB(ev_chargers) 단독 조회. data.go.kr는 1일 1회 sync에서만 호출.
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

      {/* 사용 가능 요약 */}
      <section className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">충전기 현황</h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">상태 갱신 {relativeFromNow(detail.latestStatUpdAt)}</span>
        </div>
        <p className="mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
          {detail.availableChargers}
          <span className="ml-1 text-sm font-medium text-gray-400 dark:text-gray-500">/ {detail.totalChargers}대 사용 가능</span>
        </p>
      </section>

      {/* 충전기 목록 */}
      <section className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-100">충전기 ({detail.chargers.length}대)</h2>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {detail.chargers.map((c) => {
            const tone = chargerStatTone(c.stat);
            const speed = chargerSpeed(c.chgerType, c.output);
            return (
              <li key={c.chgerId} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {chargerTypeLabel(c.chgerType)}
                    <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                      {speed === 'fast' ? '급속' : '완속'}{c.output != null ? ` · ${c.output}kW` : ''}
                    </span>
                  </p>
                  {c.statUpdAt && (
                    <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{relativeFromNow(c.statUpdAt)}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[tone]}`}>
                  {chargerStatLabel(c.stat)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

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
        충전소 정보 제공: 한국환경공단(공공데이터포털) · 상태는 1일 1회 갱신 스냅샷입니다.
      </footer>
    </main>
  );
}
