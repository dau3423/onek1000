'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { ProductCode } from '@/types/station';

interface Point { date: string; price: number }
interface Props { stationId: string; product: ProductCode }

export function PriceHistoryChart({ stationId, product }: Props) {
  const [data, setData] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    fetch(`/api/stations/${stationId}/history?product=${product}&days=30`)
      .then((r) => r.json())
      .then((d: { series?: Point[]; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setData(d.series ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, [stationId, product]);

  if (error) return <p className="text-xs text-red-500">이력 로드 실패: {error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-lg bg-gray-100" />;
  if (!data.length) return <p className="text-xs text-gray-400">아직 가격 이력이 충분하지 않아요.</p>;

  const min = Math.min(...data.map((d) => d.price));
  const max = Math.max(...data.map((d) => d.price));
  const pad = Math.max(20, Math.round((max - min) * 0.2));

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#eee" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => v.slice(5)}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[min - pad, max + pad]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={(v: number) => `${v.toLocaleString()}`}
            width={48}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v: number) => [`₩${v.toLocaleString()}`, '가격']}
            labelFormatter={(d: string) => d}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#FF6B00"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
