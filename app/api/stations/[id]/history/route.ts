// 주유소 가격 이력 — 일자별 (해당일 마지막 관측값)
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import type { ProductCode } from '@/types/station';

export const revalidate = 1800; // 30분

interface Point { date: string; price: number }

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? '30')));
  const product = (url.searchParams.get('product') ?? 'B027') as ProductCode;

  if (!isSupabaseConfigured()) {
    // 개발용 더미: 최근 30일 약간의 잡음 가격 곡선
    const today = new Date();
    const base = 1600;
    const series: Point[] = Array.from({ length: days }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (days - 1 - i));
      const drift = Math.sin(i / 4) * 25 + (Math.random() - 0.5) * 18;
      return { date: d.toISOString().slice(0, 10), price: Math.round(base + drift) };
    });
    return NextResponse.json({ stationId: params.id, product, days, series });
  }

  const sb = getSupabase();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // 일자별로 마지막 관측값 (price)을 뽑는 단일 쿼리
  const { data, error } = await sb.rpc('rpc_price_history_daily', {
    p_station_id: params.id,
    p_product: product,
    p_since: since,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const series: Point[] = (data ?? []).map((r: { day: string; price: number }) => ({
    date: r.day, price: r.price,
  }));

  return NextResponse.json({ stationId: params.id, product, days, series });
}
