'use client';

// 주유 타이밍 예측 — 추이 그래프(recharts).
// 국내 전국평균 소매가 최근 ~90일 실측 라인 + (밴드 있으면) target 지점 예측 밴드/방향 표시.
// 모바일 가독성 우선: 축/툴팁 간결, 높이 낮게. 상세페이지 PriceHistoryChart 톤 답습.

import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot,
} from 'recharts';

export interface ForecastSeriesPoint {
  date: string;
  price: number;
}

export interface ForecastBand {
  targetDate: string;
  center: number;
  low: number;
  high: number;
}

interface Props {
  series: ForecastSeriesPoint[];
  band: ForecastBand | null;
  direction: 'up' | 'flat' | 'down';
  /** 저신뢰면 밴드/방향 표시를 흐리게(과장 금지). */
  weak?: boolean;
}

// 방향별 색(필터바/마커 톤과 일관: 상승=경고, 하락=차분한 파랑, 보합=중립).
const DIR_COLOR: Record<'up' | 'flat' | 'down', string> = {
  up: '#DC2626',
  flat: '#9ca3af',
  down: '#2563EB',
};

export function ForecastChart({ series, band, direction, weak = false }: Props) {
  if (!series.length) {
    return <p className="text-xs text-gray-400">아직 추이 데이터가 충분하지 않아요.</p>;
  }

  const dirColor = DIR_COLOR[direction];

  // 밴드의 target 지점을 series 끝에 가상 포인트로 이어 붙여, 라인이 예측 지점까지 향하게 한다.
  // 실측 라인(price)과 예측 구간(forecastLow/High)을 분리해 점선/면적으로 구분 표시.
  type Row = {
    date: string;
    price: number | null;
    bandLow?: number | null;
    bandHigh?: number | null;
    forecast?: number | null;
  };
  const rows: Row[] = series.map((p) => ({ date: p.date, price: p.price }));

  if (band) {
    const last = series[series.length - 1];
    // 실측 마지막 지점에서 예측 구간이 시작되도록 앵커(실측 끝점에 band 시작값을 매단다).
    const anchorIdx = rows.length - 1;
    rows[anchorIdx].bandLow = last.price;
    rows[anchorIdx].bandHigh = last.price;
    rows[anchorIdx].forecast = last.price;
    rows.push({
      date: band.targetDate,
      price: null,
      bandLow: band.low,
      bandHigh: band.high,
      forecast: band.center === band.low ? band.high : direction === 'down' ? band.low : band.high,
    });
  }

  const prices = series.map((p) => p.price);
  const bandVals = band ? [band.low, band.high] : [];
  const allVals = [...prices, ...bandVals];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const pad = Math.max(20, Math.round((max - min) * 0.2));

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#eee" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => v.slice(5)}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            orientation="right"
            domain={[min - pad, max + pad]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={(v: number) => `${v.toLocaleString()}`}
            width={48}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v: number, name: string) => {
              if (name === 'forecast') return [`₩${v.toLocaleString()}`, '예상'];
              if (name === 'bandHigh' || name === 'bandLow') return [`₩${v.toLocaleString()}`, '예측 범위'];
              return [`₩${v.toLocaleString()}`, '실측가'];
            }}
            labelFormatter={(d: string) => d}
          />

          {/* 예측 밴드(면적) — low~high. 저신뢰면 더 흐리게. */}
          {band && (
            <>
              <Area
                type="monotone"
                dataKey="bandHigh"
                stroke="none"
                fill={dirColor}
                fillOpacity={weak ? 0.06 : 0.12}
                isAnimationActive={false}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="bandLow"
                stroke="none"
                fill="#fff"
                fillOpacity={1}
                isAnimationActive={false}
                connectNulls
              />
            </>
          )}

          {/* 실측 라인 */}
          <Line
            type="monotone"
            dataKey="price"
            stroke="#FF6B00"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />

          {/* 예측 방향 점선 — 실측 끝 → target 지점. */}
          {band && (
            <Line
              type="monotone"
              dataKey="forecast"
              stroke={dirColor}
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeOpacity={weak ? 0.5 : 1}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}

          {/* target 지점 마커 */}
          {band && (
            <ReferenceDot
              x={band.targetDate}
              y={band.center === band.low ? band.high : direction === 'down' ? band.low : band.high}
              r={4}
              fill={dirColor}
              fillOpacity={weak ? 0.5 : 1}
              stroke="#fff"
              strokeWidth={1.5}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
