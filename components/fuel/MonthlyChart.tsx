'use client';

// 월별 주유비 막대 차트 — recharts 를 쓰는 유일한 부분이라 별도 파일로 분리했다.
// FuelReport 는 이 컴포넌트를 지연 로딩한다: 요약 카드·통계는 recharts 없이 바로 그려지고,
// 차트 코드(약 95 KB)는 그 뒤에 따라온다.
import { useLocale, useTranslations } from 'next-intl';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import type { FuelReport as FuelReportData } from '@/types/fuel-report';

export function MonthlyChart({ data }: { data: FuelReportData['monthly'] }) {
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
