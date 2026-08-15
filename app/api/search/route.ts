// 주유소 검색 — 상호/주소 부분일치 (pg_trgm 가속)
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getMockStations } from '@/lib/mock/stations';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';

export const revalidate = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit') ?? '15')));

  // 유종: 미지정 시 B027 기본(history API와 동일 관례), 화이트리스트 밖 값은 400(SRS §5 공통 규약)
  // in 연산자는 프로토타입 체인(toString 등)까지 통과시키므로 자기 소유 키만 허용한다.
  const productRaw = url.searchParams.get('product') ?? 'B027';
  const VALID_PRODUCTS = Object.keys(PRODUCT_LABEL) as ProductCode[];
  if (!VALID_PRODUCTS.includes(productRaw as ProductCode)) {
    return NextResponse.json({ error: 'invalid product' }, { status: 400 });
  }
  const product = productRaw as ProductCode;

  if (q.length < 2) return NextResponse.json({ q, results: [] });

  if (!isSupabaseConfigured()) {
    // mock 검색 — 선택 유종 기준 가격 동봉
    const pool = getMockStations(product);
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
  // left join(non-inner) + 임베드 유종 필터: 해당 유종 가격이 없는 업소도 항상 노출된다
  // (부모 행 유지 + 임베드만 필터 — 실 Supabase 검증 완료). 가격 없으면 price:null.
  // inner join이던 과거엔 비휘발유 전용 업소(LPG 전용 충전소 등)가 이름 검색에서 통째로 누락됐다.
  const { data, error } = await sb
    .from('stations')
    .select('id, name, brand_code, address, lat, lng, is_self, prices_latest(product, price)')
    .or(`name.ilike.${like},address.ilike.${like}`)
    .eq('prices_latest.product', product)
    .order('name')
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (data ?? []).map((row: any) => ({
    id: row.id, name: row.name, brand: row.brand_code ?? 'ETC',
    address: row.address, lat: row.lat, lng: row.lng,
    isSelf: row.is_self,
    price: row.prices_latest?.[0]?.price ?? null,
    product,
  }));
  return NextResponse.json({ q, results });
}
