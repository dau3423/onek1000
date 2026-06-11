// 관리자 대시보드 + 도구 허브 (/admin) — 운영자 전용.
//
// 접근 보호: ADMIN_EMAILS(콤마구분) 게이트. 비관리자/비로그인은 notFound()로 가린다.
//   - 이메일 하드코딩 금지(lib/auth/admin.ts). ADMIN_EMAILS 미설정 시 관리자 없음 → 전원 거부.
// 데이터: 우리 Supabase만 조회(외부 API 호출 없음). 각 카드 조회 실패해도 페이지가
//   깨지지 않게 '-'로 graceful 처리한다. noindex 유지.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminOrNull } from '@/lib/auth/admin';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

export const metadata: Metadata = {
  title: '관리자 대시보드 (운영)',
  robots: { index: false, follow: false },
};

// 매 요청 시 최신 DB 값으로(캐시 안 함).
export const dynamic = 'force-dynamic';

// 통계 카드 1개 — 숫자 또는 '-'(조회 실패/미설정).
interface Stat {
  label: string;
  value: string;
}

// KST(UTC+9) 기준 오늘 00:00 / N일 전 00:00의 ISO 문자열을 만든다.
// users.created_at(timestamptz)와 비교하기 위한 경계값.
function kstDayStartIso(daysAgo = 0): string {
  const KST_OFFSET_MS = 9 * 3600 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  // KST 자정으로 절단 후 daysAgo만큼 뒤로.
  nowKst.setUTCHours(0, 0, 0, 0);
  const startKstMs = nowKst.getTime() - daysAgo * 86400000;
  // 다시 UTC로 환산해 ISO 반환.
  return new Date(startKstMs - KST_OFFSET_MS).toISOString();
}

const fmt = (n: number | null | undefined): string =>
  typeof n === 'number' ? n.toLocaleString('ko-KR') : '-';

type Sb = ReturnType<typeof getSupabase>;

// head:true count 조회 — 실패하면 null(상위에서 '-' 표시).
async function headCount(
  build: (sb: Sb) => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  try {
    const sb = getSupabase();
    const { count, error } = await build(sb);
    return error ? null : count ?? null;
  } catch {
    return null;
  }
}

async function loadStats(): Promise<Stat[]> {
  if (!isSupabaseConfigured()) {
    // Mock/로컬(키 없음): 조회 불가 → 전부 '-'. 페이지는 정상 렌더.
    return [
      { label: '총 회원수', value: '-' },
      { label: '오늘 가입', value: '-' },
      { label: '최근 7일 가입', value: '-' },
      { label: '프리미엄 사용자', value: '-' },
      { label: '주유소 수', value: '-' },
      { label: '고속도로(EXP) 주유소', value: '-' },
      { label: '최신가 행 수', value: '-' },
    ];
  }

  const todayStart = kstDayStartIso(0);
  const sevenDaysStart = kstDayStartIso(7);
  const nowIso = new Date().toISOString();

  const [
    totalUsers,
    todayUsers,
    weekUsers,
    premiumUsers,
    stations,
    expStations,
    pricesLatest,
  ] = await Promise.all([
    // 회원 수 집계는 활성 회원만(탈퇴=소프트삭제 제외). 0028 미적용 환경은 headCount가 '-'로 안전 폴백.
    headCount((sb) => sb.from('users').select('*', { count: 'exact', head: true }).is('deleted_at', null)),
    headCount((sb) => sb.from('users').select('*', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', todayStart)),
    headCount((sb) => sb.from('users').select('*', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', sevenDaysStart)),
    // 프리미엄: status∈(trial,active,canceled) & 기간 유효(periodEnd 폴백 일관성을 위해
    // current_period_end 기준으로 근사 — trial은 current_period_end=trial_end로 채워짐).
    headCount((sb) =>
      sb
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .in('status', ['trial', 'active', 'canceled'])
        .gt('current_period_end', nowIso),
    ),
    headCount((sb) => sb.from('stations').select('*', { count: 'exact', head: true })),
    headCount((sb) => sb.from('stations').select('*', { count: 'exact', head: true }).eq('brand_code', 'EXP')),
    headCount((sb) => sb.from('prices_latest').select('*', { count: 'exact', head: true })),
  ]);

  return [
    { label: '총 회원수', value: fmt(totalUsers) },
    { label: '오늘 가입(KST)', value: fmt(todayUsers) },
    { label: '최근 7일 가입', value: fmt(weekUsers) },
    { label: '프리미엄 사용자', value: fmt(premiumUsers) },
    { label: '주유소 수', value: fmt(stations) },
    { label: '고속도로(EXP) 주유소', value: fmt(expStations) },
    { label: '최신가 행 수', value: fmt(pricesLatest) },
  ];
}

// 도구 허브 링크 카드 정의.
const TOOLS: { href: string; title: string; desc: string }[] = [
  {
    href: '/admin/daily-top10',
    title: '일일 TOP10 SNS 도우미',
    desc: '오늘자 전국 최저가 TOP10을 SNS용 텍스트/이미지로 복사·다운로드.',
  },
  {
    href: '/admin/forecast',
    title: '주유 타이밍 예측 정확도',
    desc: '예측 누적 적중률(hit-rate)·유종/방향별·최근 예측 추적(내부용).',
  },
];

export default async function AdminPage() {
  const admin = await getAdminOrNull();
  if (!admin) notFound();

  const stats = await loadStats();

  return (
    // 관리 도구는 가독성 우선 — OS 다크모드와 무관하게 라이트 배경+진한 글자로 고정.
    // (통계 숫자/라벨, 카드 등은 흰 배경 가정으로 디자인되어 dark: 대응 대신 라이트로 핀)
    // color-scheme: light 로 스크롤바/폼 컨트롤도 라이트로 강제.
    <main
      className="mx-auto min-h-dvh max-w-4xl bg-gray-50 px-4 py-8 text-gray-900 sm:py-10"
      style={{ colorScheme: 'light' }}
    >
      <header className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">
          {admin} 으로 로그인됨 · 운영 통계 및 도구
        </p>
      </header>

      {/* 통계 카드 그리드 */}
      <section aria-label="운영 통계" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="text-xs font-medium text-gray-500">{s.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
              {s.value}
            </div>
          </div>
        ))}
      </section>

      {/* 도구 허브 */}
      <section aria-label="운영 도구" className="mt-8">
        <h2 className="mb-3 text-sm font-bold text-gray-700">운영 도구</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">{t.title}</span>
                <span className="text-gray-300 transition group-hover:text-primary" aria-hidden>
                  →
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
