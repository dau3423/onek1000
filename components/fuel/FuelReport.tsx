'use client';

// 차계부 / 주유비 리포트 — 모든 회원 무료. 우리 DB(fuel_logs) 집계만 보여준다.
// 요약 카드(이번 달 주유비/절약 추정/평균 연비) + 월별 주유비 막대 차트 + 총/평균 통계 + 절약 안내.
// 빈 상태: 기록이 없으면 기록 유도. 연비/절약은 데이터가 없으면 안내로 대체(널 가드).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import type { FuelReport as FuelReportData } from '@/types/fuel-report';

const MONTH_OPTIONS = [6, 12] as const;

export function FuelReport() {
  const [months, setMonths] = useState<number>(12);
  const [report, setReport] = useState<FuelReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/fuel-logs/report?months=${months}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setReport((d.report ?? null) as FuelReportData | null);
      })
      .catch(() => {
        if (alive) setReport(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [months]);

  if (loading && !report) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  // 기록이 전혀 없으면(주유/충전 모두 0) 빈 상태로 유도.
  if (!report || (report.summary.count === 0 && report.ev.count === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="text-5xl">📊</div>
        <p className="text-sm text-gray-600 dark:text-gray-300">아직 리포트가 없어요.</p>
        <p className="text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          주유 기록을 남기면 월별 주유비·연비·절약 리포트가 쌓여요.
        </p>
        <Link href="/" className="mt-1 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
          지도에서 주유소 찾기
        </Link>
      </div>
    );
  }

  const { summary, monthly, economy, savings, ev } = report;

  return (
    <div className="space-y-5">
      {/* 기간 토글 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">주유 리포트</h2>
        <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              aria-pressed={months === m}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                months === m
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              최근 {m}개월
            </button>
          ))}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard
          label="이번 달 주유비"
          value={summary.thisMonthSpent > 0 ? `₩${summary.thisMonthSpent.toLocaleString()}` : '-'}
        />
        <SummaryCard
          label="절약 추정"
          value={savings.estimatedWon != null ? `₩${savings.estimatedWon.toLocaleString()}` : '-'}
          accent={savings.estimatedWon != null && savings.estimatedWon > 0}
        />
        <SummaryCard
          label="평균 연비"
          value={economy.avgKmPerL != null ? `${economy.avgKmPerL} km/L` : '-'}
        />
      </div>

      {/* 월별 주유비 차트 */}
      <section className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
        <h3 className="mb-1 text-xs font-bold text-gray-700 dark:text-gray-300">월별 주유비</h3>
        <MonthlyChart data={monthly} />
      </section>

      {/* 총/평균 통계 */}
      <section className="grid grid-cols-2 gap-2">
        <StatRow label="총 주유비" value={summary.totalSpent > 0 ? `₩${summary.totalSpent.toLocaleString()}` : '-'} />
        <StatRow label="총 주유량" value={summary.totalLiters > 0 ? `${summary.totalLiters.toLocaleString()}L` : '-'} />
        <StatRow label="평균 단가" value={summary.avgUnitPrice != null ? `₩${summary.avgUnitPrice.toLocaleString()}/L` : '-'} />
        <StatRow label="주유 횟수" value={`${summary.count}회`} />
      </section>

      {/* 절약 추정 설명 (정직하게: 현재 전국 평균 대비) */}
      <SavingsNote savings={savings} />

      {/* 연비 안내(빈 상태) */}
      {economy.avgKmPerL == null && (
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
          {economy.reason === 'no-odometer'
            ? '기록 편집에서 주행거리(km)를 입력하면 연비(km/L)를 계산해 드려요.'
            : '주행거리·주유량이 연속으로 2회 이상 쌓이면 평균 연비를 보여드려요.'}
        </p>
      )}

      {/* EV 참고(있을 때만) */}
      {ev.count > 0 && (
        <section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/10">
          <h3 className="mb-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">⚡ 전기차 충전 (참고)</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">충전 횟수</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900 dark:text-gray-100">{ev.count}회</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">총 충전량</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900 dark:text-gray-100">
                {ev.totalKwh > 0 ? `${ev.totalKwh.toLocaleString()}kWh` : '-'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">총 충전비</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900 dark:text-gray-100">
                {ev.totalSpent > 0 ? `₩${ev.totalSpent.toLocaleString()}` : '-'}
              </div>
            </div>
          </div>
        </section>
      )}

      <Link
        href="/my/fuel-logs"
        className="block rounded-lg border border-gray-200 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        기록 보기 · 편집 →
      </Link>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-800">
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
      <div
        className={`mt-1 text-sm font-bold ${
          accent ? 'text-primary' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

function MonthlyChart({ data }: { data: FuelReportData['monthly'] }) {
  const hasAny = data.some((d) => d.spent > 0);
  if (!hasAny) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-gray-400 dark:text-gray-500">
        금액이 입력된 주유 기록이 쌓이면 월별 추이가 표시돼요.
      </div>
    );
  }
  // 차트 데이터: 'YYYY-MM' → 'M월' 라벨.
  const chart = data.map((d) => ({ ...d, label: `${Number(d.month.slice(5))}월` }));
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis
            orientation="right"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : `${v}`)}
            width={36}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,107,0,0.06)' }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v: number) => [`₩${v.toLocaleString()}`, '주유비']}
            labelFormatter={(l: string) => l}
          />
          <Bar dataKey="spent" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {chart.map((d) => (
              <Cell key={d.month} fill={d.spent > 0 ? '#FF6B00' : '#e5e7eb'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SavingsNote({ savings }: { savings: FuelReportData['savings'] }) {
  if (savings.usedCount === 0) {
    return (
      <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
        단가와 주유량(L)이 함께 기록되면 “전국 평균 대비 절약 추정”을 계산해 드려요.
      </p>
    );
  }
  const baselineText = (Object.entries(savings.baseline) as Array<[ProductCode, number]>)
    .filter(([p]) => p in PRODUCT_LABEL)
    .map(([p, v]) => `${PRODUCT_LABEL[p]} ₩${v.toLocaleString()}`)
    .join(' · ');
  return (
    <p className="rounded-xl bg-primary/5 px-4 py-3 text-xs leading-relaxed text-gray-600 dark:bg-primary/10 dark:text-gray-300">
      절약 추정은 <b>현재 전국 평균가</b> 대비 내가 넣은 단가·주유량으로 산출한 <b>추정치</b>예요
      {baselineText && <> (기준 {baselineText}/L)</>}. 시점별 평균이 아닌 현재 평균 기준이라 참고용으로
      봐주세요.
    </p>
  );
}
