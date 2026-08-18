'use client';

// 차계부 / 주유비 리포트 — 모든 회원 무료. 우리 DB(fuel_logs) 집계만 보여준다.
// 요약 카드(이번 달 주유비/절약 추정/평균 연비) + 월별 주유비 막대 차트 + 총/평균 통계 + 절약 안내.
// 빈 상태: 기록이 없으면 기록 유도. 연비/절약은 데이터가 없으면 안내로 대체(널 가드).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { BoltIcon, ChartIcon, ChevronRightIcon } from '@/components/icons';
import { useProductLabel } from '@/lib/i18n/labels';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import type { FuelReport as FuelReportData } from '@/types/fuel-report';

const MONTH_OPTIONS = [6, 12] as const;

export function FuelReport() {
  const t = useTranslations('my');
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
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  // 기록이 전혀 없으면(주유/충전 모두 0) 빈 상태로 유도.
  if (!report || (report.summary.count === 0 && report.ev.count === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <ChartIcon className="h-12 w-12 text-gray-300" />
        <p className="text-sm text-gray-600">{t('report.emptyMessage')}</p>
        <p className="text-xs leading-relaxed text-gray-400">
          {t('report.emptyHint')}
        </p>
        <Link href="/" className="mt-1 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
          {t('report.findStationOnMap')}
        </Link>
      </div>
    );
  }

  const { summary, monthly, economy, savings, ev } = report;

  return (
    <div className="space-y-5">
      {/* 기간 토글 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">{t('reportTitle')}</h2>
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              aria-pressed={months === m}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                months === m
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {t('report.recentMonths', { months: m })}
            </button>
          ))}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard
          label={t('report.thisMonthSpentLabel')}
          value={summary.thisMonthSpent > 0 ? `₩${summary.thisMonthSpent.toLocaleString()}` : '-'}
        />
        <SummaryCard
          label={t('report.estimatedSavingsLabel')}
          value={savings.estimatedWon != null ? `₩${savings.estimatedWon.toLocaleString()}` : '-'}
          accent={savings.estimatedWon != null && savings.estimatedWon > 0}
        />
        <SummaryCard
          label={t('report.avgEconomyLabel')}
          value={economy.avgKmPerL != null ? `${economy.avgKmPerL} km/L` : '-'}
        />
      </div>

      {/* 월별 주유비 차트 */}
      <section className="rounded-xl border border-gray-100 p-3">
        <h3 className="mb-1 text-xs font-bold text-gray-700">{t('report.monthlyChartTitle')}</h3>
        <MonthlyChart data={monthly} />
      </section>

      {/* 총/평균 통계 */}
      <section className="grid grid-cols-2 gap-2">
        <StatRow label={t('totalSpentLabel')} value={summary.totalSpent > 0 ? `₩${summary.totalSpent.toLocaleString()}` : '-'} />
        <StatRow label={t('report.totalLitersLabel')} value={summary.totalLiters > 0 ? `${summary.totalLiters.toLocaleString()}L` : '-'} />
        <StatRow label={t('avgUnitPriceLabel')} value={summary.avgUnitPrice != null ? `₩${summary.avgUnitPrice.toLocaleString()}/L` : '-'} />
        <StatRow label={t('report.fuelCountLabel')} value={t('report.countValue', { count: summary.count })} />
      </section>

      {/* 절약 추정 설명 (정직하게: 현재 전국 평균 대비) */}
      <SavingsNote savings={savings} />

      {/* 연비 안내(빈 상태) */}
      {economy.avgKmPerL == null && (
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500">
          {economy.reason === 'no-odometer'
            ? t('report.economyHintNoOdometer')
            : t('report.economyHintNeedMore')}
        </p>
      )}

      {/* EV 참고(있을 때만) */}
      {ev.count > 0 && (
        <section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
          <h3 className="mb-2 flex items-center gap-1 text-xs font-bold text-emerald-700">
            <BoltIcon className="h-4 w-4" />{t('report.evSectionTitle')}
          </h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[11px] text-gray-500">{t('report.evCountLabel')}</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900">{t('report.countValue', { count: ev.count })}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">{t('report.evTotalKwhLabel')}</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900">
                {ev.totalKwh > 0 ? `${ev.totalKwh.toLocaleString()}kWh` : '-'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">{t('report.evTotalSpentLabel')}</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900">
                {ev.totalSpent > 0 ? `₩${ev.totalSpent.toLocaleString()}` : '-'}
              </div>
            </div>
          </div>
        </section>
      )}

      <Link
        href="/my/fuel-logs"
        className="flex items-center justify-center gap-0.5 rounded-lg border border-gray-200 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        {t('report.viewEditLink')}<ChevronRightIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div
        className={`mt-1 text-sm font-bold ${
          accent ? 'text-primary' : 'text-gray-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-bold text-gray-900">{value}</span>
    </div>
  );
}

function MonthlyChart({ data }: { data: FuelReportData['monthly'] }) {
  const t = useTranslations('my');
  const locale = useLocale();
  const hasAny = data.some((d) => d.spent > 0);
  if (!hasAny) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-gray-400">
        {t('report.chartEmptyMessage')}
      </div>
    );
  }
  // 차트 데이터: 'YYYY-MM' → 로케일별 짧은 월 표기(예: ko '3월', en 'Mar').
  // Intl.DateTimeFormat(locale,{month:'short'})는 ko/zh/ja에서 원본과 동일하게 '3월'/'3月'을 낸다.
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  const chart = data.map((d) => ({
    ...d,
    label: monthFmt.format(new Date(Number(d.month.slice(0, 4)), Number(d.month.slice(5)) - 1, 1)),
  }));
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
            formatter={(v: number) => [`₩${v.toLocaleString()}`, t('report.tooltipFuelCostLabel')]}
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
  const t = useTranslations('my');
  const productLabel = useProductLabel();
  if (savings.usedCount === 0) {
    return (
      <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500">
        {t('report.savingsHintEmpty')}
      </p>
    );
  }
  const baselineText = (Object.entries(savings.baseline) as Array<[ProductCode, number]>)
    .filter(([p]) => p in PRODUCT_LABEL)
    .map(([p, v]) => `${productLabel(p)} ₩${v.toLocaleString()}`)
    .join(' · ');
  return (
    <p className="rounded-xl bg-primary/5 px-4 py-3 text-xs leading-relaxed text-gray-600">
      {t.rich('report.savingsNote', {
        b: (chunks) => <b>{chunks}</b>,
        hasBaseline: baselineText ? 'yes' : 'no',
        baseline: baselineText,
      })}
    </p>
  );
}
