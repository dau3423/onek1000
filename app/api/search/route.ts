// 주유소 검색 — 상호/주소 부분일치 (pg_trgm 가속)
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getMockStations } from '@/lib/mock/stations';

export const revalidate = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit') ?? '15')));

  if (q.length < 2) return NextResponse.json({ q, results: [] });

  if (!isSupabaseConfigured()) {
    // mock 검색 — 휘발유 기준 가격 동봉
    const pool = getMockStations('B027');
    const needle = q.toLowerCase();
    const results = pool
      .filter((s) => s.name.toLowerCase().includes(needle) || s.address.toLowerCase().includes(needle))
      .slice(0, limit)
      .map((s) => ({
        id: s.id, name: s.name, brand: s.brand, address: s.address,
        lat: s.lat, lng: s.lng, isSelf: s.isSelf,
        price: s.price, product: s.product,
      }));
    return NextResponse.json({ q, results });
  }

  const sb = getSupabase();
  const like = `%${q.replace(/[%_]/g, (m) => '\\' + m)}%`;
  const { data, error } = await sb
    .from('stations')
    .select('id, name, brand_code, address, lat, lng, is_self, prices_latest!inner(product, price)')
    .or(`name.ilike.${like},address.ilike.${like}`)
    .eq('prices_latest.product', 'B027')
    .order('name')
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (data ?? []).map((row: any) => ({
    id: row.id, name: row.name, brand: row.brand_code ?? 'ETC',
    address: row.address, lat: row.lat, lng: row.lng,
    isSelf: row.is_self,
    price: row.prices_latest?.[0]?.price ?? null,
    product: 'B027',
  }));
  return NextResponse.json({ q, results });
}
