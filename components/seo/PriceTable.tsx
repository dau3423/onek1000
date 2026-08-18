// SEO 지역/시군구 랜딩 공용 — 유종별 최저가 TOP10 표.
// i18n-ignore(파일 전체): app/regions/**(SSG, 291페이지) 전용 컴포넌트 — 번역 provider(app/(intl)) 밖이라
// useTranslations를 쓰면 런타임 에러가 난다. /regions 자체가 이번 국제화 과제 범위 밖(한국어 SSG 유지)이므로
// 이 컴포넌트의 한국어는 의도된 원본이다. 아래 각 줄에도 스캐너용 i18n-ignore를 개별로 남긴다.
import { BRAND_LABEL, type DailyTop10Item } from '@/types/station';

const won = (n: number) => n.toLocaleString('ko-KR');

export function PriceTable({ label, items, avg }: { label: string; items: DailyTop10Item[]; avg: number | null }) {
  if (items.length === 0) {
    return (
      <section className="mt-8">
        {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
        <h2 className="text-lg font-bold text-gray-900">{label} 최저가 TOP10</h2>
        {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
        <p className="mt-2 text-sm text-gray-500">해당 지역의 {label} 가격이 아직 집계되지 않았습니다. 잠시 후 다시 확인해 주세요.</p>
      </section>
    );
  }
  const cheapest = items[0].price;
  const diff = avg != null ? avg - cheapest : null;
  return (
    <section className="mt-8">
      {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
      <h2 className="text-lg font-bold text-gray-900">{label} 최저가 TOP10</h2>
      {avg != null && (
        <p className="mt-1 text-[13px] text-gray-500">
          {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
          전국 평균 {won(avg)}원
          {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
          {diff != null && diff > 0 && <> · 1위는 리터당 <b className="text-orange-600">{won(diff)}원</b> 저렴 (50L 가득 시 약 {won(diff * 50)}원 차이)</>}
        </p>
      )}
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
              <th className="px-3 py-2 text-left font-medium">순위</th>
              {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
              <th className="px-3 py-2 text-left font-medium">주유소</th>
              {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
              <th className="px-3 py-2 text-left font-medium">브랜드</th>
              {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
              <th className="px-3 py-2 text-right font-medium">가격(원/L)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-700">{it.rank}</td>
                {/* i18n-ignore: /regions SSG 전용 — 번역 provider 밖 */}
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
