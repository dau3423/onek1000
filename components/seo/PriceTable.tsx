// SEO 지역/시군구 랜딩 공용 — 유종별 최저가 TOP10 표.
import { BRAND_LABEL, type DailyTop10Item } from '@/types/station';

const won = (n: number) => n.toLocaleString('ko-KR');

export function PriceTable({ label, items, avg }: { label: string; items: DailyTop10Item[]; avg: number | null }) {
  if (items.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900">{label} 최저가 TOP10</h2>
        <p className="mt-2 text-sm text-gray-500">해당 지역의 {label} 가격이 아직 집계되지 않았습니다. 잠시 후 다시 확인해 주세요.</p>
      </section>
    );
  }
  const cheapest = items[0].price;
  const diff = avg != null ? avg - cheapest : null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-gray-900">{label} 최저가 TOP10</h2>
      {avg != null && (
        <p className="mt-1 text-[13px] text-gray-500">
          전국 평균 {won(avg)}원
          {diff != null && diff > 0 && <> · 1위는 리터당 <b className="text-orange-600">{won(diff)}원</b> 저렴 (50L 가득 시 약 {won(diff * 50)}원 차이)</>}
        </p>
      )}
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="px-3 py-2 text-left font-medium">순위</th>
              <th className="px-3 py-2 text-left font-medium">주유소</th>
              <th className="px-3 py-2 text-left font-medium">브랜드</th>
              <th className="px-3 py-2 text-right font-medium">가격(원/L)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-700">{it.rank}</td>
                <td className="px-3 py-2 text-gray-900">{it.name}{it.isSelf && <span className="ml-1 rounded bg-gray-100 px-1 text-[11px] text-gray-500">셀프</span>}</td>
                <td className="px-3 py-2 text-gray-500">{BRAND_LABEL[it.brand] ?? it.brand}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">{won(it.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
