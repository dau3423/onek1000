// 주유 타이밍 예측 정확도 대시보드 (/admin/forecast) — 운영자 전용(내부용).
//
// 접근 보호: /admin 과 동일하게 ADMIN_EMAILS 게이트(getAdminOrNull). 비관리자/비로그인은
//   notFound()로 가린다. 공개 비인증 노출 금지(noindex 유지).
// 데이터: 우리 Supabase만. 집계는 lib/forecast/accuracy.ts 의 공용 함수(getForecastAccuracy)를
//   서버에서 직접 호출한다(CRON_SECRET fetch 우회 안 함). cron JSON 라우트와 같은 함수.
// graceful: 데이터 0건/DB 미설정(skipped) 시 "데이터 없음" 안내로 깨지지 않게.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminOrNull } from '@/lib/auth/admin';
import { getForecastAccuracy, type ForecastAccuracy } from '@/lib/forecast/accuracy';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';

export const metadata: Metadata = {
  title: '주유 타이밍 예측 정확도 (운영)',
  robots: { index: false, follow: false },
};

// 매 요청 시 최신 DB 값으로(캐시 안 함).
export const dynamic = 'force-dynamic';

// 유종 코드 → 표기. PRODUCT_LABEL 재사용(중복 정의 금지). 보통/자동차 수식어만 부연.
const FUEL_LABEL: Record<string, string> = {
  B027: `보통휘발유(${PRODUCT_LABEL.B027})`,
  D047: `자동차경유(${PRODUCT_LABEL.D047})`,
};
const fuelLabel = (code: string): string =>
  FUEL_LABEL[code] ?? (code in PRODUCT_LABEL ? PRODUCT_LABEL[code as ProductCode] : code);

// 예측/실제 방향 코드 → 한글.
const DIR_LABEL: Record<string, string> = { up: '상승', flat: '보합', down: '하락' };
const dirLabel = (d: string | null): string => (d ? DIR_LABEL[d] ?? d : '-');

// 방향 표 노출 순서(상승/보합/하락 고정 — 보합 약점 비교용).
const DIR_ORDER = ['up', 'flat', 'down'] as const;

// 비율(0~1) → 퍼센트 문자열. null은 '-'.
const pct = (n: number | null | undefined): string =>
  typeof n === 'number' ? `${(n * 100).toFixed(1)}%` : '-';

// hit-rate 색상(가독성 — 라이트 고정). 0.6↑ 녹색, 0.45↑ 황색, 그 외 적색.
function rateClass(rate: number | null): string {
  if (rate == null) return 'text-gray-400';
  if (rate >= 0.6) return 'text-emerald-600';
  if (rate >= 0.45) return 'text-amber-600';
  return 'text-red-600';
}

export default async function AdminForecastPage() {
  const admin = await getAdminOrNull();
  if (!admin) notFound();

  // 서버에서 직접 집계(공용 함수). DB 에러는 graceful 폴백(아래 errored).
  let acc: ForecastAccuracy | null = null;
  let errored: string | null = null;
  try {
    acc = await getForecastAccuracy({ recentLimit: 30 });
  } catch (e) {
    errored = e instanceof Error ? e.message : '집계 조회 실패';
  }

  return (
    // 라이트 고정(/admin 톤과 통일). 다크모드 무관하게 흰 배경+진한 글자.
    <main
      className="mx-auto min-h-dvh max-w-4xl bg-gray-50 px-4 py-8 text-gray-900 sm:py-10"
      style={{ colorScheme: 'light' }}
    >
      <header className="mb-6">
        <div className="mb-2">
          <Link href="/admin" className="text-xs font-medium text-gray-500 hover:text-primary">
            ← 관리자 대시보드
          </Link>
        </div>
        <h1 className="text-xl font-bold text-gray-900">주유 타이밍 예측 정확도</h1>
        <p className="mt-1 text-sm text-gray-500">
          누적 hit-rate(내부 검증용) · 모델 버전{' '}
          <span className="font-mono font-semibold text-gray-700">
            {acc?.modelVersion ?? '-'}
          </span>
        </p>
      </header>

      {errored && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          집계 조회 중 오류가 발생했습니다: {errored}
        </div>
      )}

      {!errored && acc?.skipped && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          데이터 없음 — Mock 모드이거나 Supabase가 설정되지 않았습니다.
        </div>
      )}

      {!errored && acc && !acc.skipped && <Dashboard acc={acc} />}
    </main>
  );
}

// 집계 결과 렌더(서버 컴포넌트 — 표 위주). skipped=false 인 경우만 호출.
function Dashboard({ acc }: { acc: ForecastAccuracy }) {
  const evaluated = acc.overall.n;

  // 평가된 건이 0이면 통계 표가 비므로 안내만(하지만 pendingEval은 보여줌).
  return (
    <div className="space-y-8">
      {/* 핵심 지표 카드 */}
      <section aria-label="핵심 지표" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2">
          <div className="text-xs font-medium text-gray-500">전체 적중률(hit-rate)</div>
          <div
            className={`mt-1 text-4xl font-extrabold tabular-nums ${rateClass(acc.overall.hitRate)}`}
          >
            {pct(acc.overall.hitRate)}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            적중 {acc.overall.hits.toLocaleString('ko-KR')} / 평가{' '}
            {evaluated.toLocaleString('ko-KR')}건
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium text-gray-500">평가 완료</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {evaluated.toLocaleString('ko-KR')}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium text-gray-500">평가 대기</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {acc.pendingEval.toLocaleString('ko-KR')}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">target 지남·미평가</div>
        </div>
      </section>

      {evaluated === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          아직 평가된 예측이 없습니다. target_date 도래 후 평가 배치가 적중 여부를 채웁니다.
        </div>
      ) : (
        <>
          {/* 유종별 */}
          <section aria-label="유종별 적중률">
            <h2 className="mb-3 text-sm font-bold text-gray-700">유종별 적중률</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-4 py-2 font-medium">유종</th>
                    <th className="px-4 py-2 text-right font-medium">적중률</th>
                    <th className="px-4 py-2 text-right font-medium">평가수</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(acc.byFuel).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-center text-gray-400">
                        데이터 없음
                      </td>
                    </tr>
                  ) : (
                    Object.entries(acc.byFuel).map(([fuel, f]) => (
                      <tr key={fuel} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-gray-900">{fuelLabel(fuel)}</td>
                        <td
                          className={`px-4 py-3 text-right font-bold tabular-nums ${rateClass(f.hitRate)}`}
                        >
                          {pct(f.hitRate)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                          {f.n.toLocaleString('ko-KR')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 방향별 — '보합' 약점 가시화 */}
          <section aria-label="방향별 적중률">
            <h2 className="mb-1 text-sm font-bold text-gray-700">방향별 적중률(예측 방향 기준)</h2>
            <p className="mb-3 text-xs text-gray-400">
              방향별 신호의 정확도. 통상 &lsquo;보합&rsquo;이 약하며, 모델 개선의 근거가 된다.
            </p>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-4 py-2 font-medium">방향</th>
                    <th className="px-4 py-2 text-right font-medium">적중률</th>
                    <th className="px-4 py-2 text-right font-medium">적중/평가</th>
                  </tr>
                </thead>
                <tbody>
                  {DIR_ORDER.filter((d) => acc.byDirection[d]).map((d) => {
                    const s = acc.byDirection[d];
                    return (
                      <tr key={d} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {DIR_LABEL[d]}
                          {d === 'flat' && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              주의
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-bold tabular-nums ${rateClass(s.hitRate)}`}
                        >
                          {pct(s.hitRate)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                          {s.hits.toLocaleString('ko-KR')}/{s.n.toLocaleString('ko-KR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* 최근 예측 목록 */}
      <section aria-label="최근 예측">
        <h2 className="mb-3 text-sm font-bold text-gray-700">
          최근 예측 ({acc.recent.length.toLocaleString('ko-KR')}건)
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">예측일</th>
                <th className="px-3 py-2 font-medium">유종</th>
                <th className="px-3 py-2 font-medium">예측방향</th>
                <th className="px-3 py-2 text-right font-medium">신뢰도</th>
                <th className="px-3 py-2 font-medium">대상일</th>
                <th className="px-3 py-2 font-medium">실제방향</th>
                <th className="px-3 py-2 text-center font-medium">적중</th>
              </tr>
            </thead>
            <tbody>
              {acc.recent.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-gray-400">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                acc.recent.map((r, i) => (
                  <tr key={`${r.forecastDate}-${r.fuelType}-${i}`} className="border-b border-gray-50 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gray-700">
                      {r.forecastDate}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">
                      {fuelLabel(r.fuelType)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-gray-900">
                      {dirLabel(r.direction)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-500">
                      {typeof r.confidence === 'number' ? `${(r.confidence * 100).toFixed(0)}%` : '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gray-500">
                      {r.targetDate}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">
                      {dirLabel(r.actualDirection)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      {r.hit == null ? (
                        <span className="text-gray-300">대기</span>
                      ) : r.hit ? (
                        <span className="font-bold text-emerald-600">O</span>
                      ) : (
                        <span className="font-bold text-red-500">X</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
