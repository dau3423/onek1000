// 주유소 상세의 "내 주유 기록" 섹션 (서버 컴포넌트).
// 로그인 사용자의 "이 주유소" 기록만 최신순으로 표시한다. 진입 경로 무관(상세 페이지에 내장).
// 비로그인이거나 기록이 없으면 아무것도 렌더하지 않는다(섹션 숨김).
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { queryMyFuelLogsAtStation } from '@/lib/db/queries';
import { PRODUCT_LABEL } from '@/types/station';
import type { FuelLog } from '@/types/fuel-log';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export async function MyFuelLogsSection({ stationId }: { stationId: string }) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null; // 비로그인은 미표시

  let logs: FuelLog[] = [];
  try {
    logs = await queryMyFuelLogsAtStation(email, stationId);
  } catch {
    return null; // 조회 실패 시 섹션 숨김(상세 본문에 영향 0)
  }
  if (logs.length === 0) return null; // 이 주유소 기록 없으면 섹션 숨김

  return (
    <section className="border-t border-gray-100 px-5 py-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-800">
        내 주유 기록
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {logs.length}건
        </span>
      </h2>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
        {logs.map((l) => (
          <li key={l.id} className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{formatDate(l.loggedAt)}</span>
              {l.kind === 'ev' ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  ⚡ 충전
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                  ⛽ {PRODUCT_LABEL[l.product]}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              {l.kind === 'ev' ? (
                <>
                  {l.unitPrice != null && <span>₩{l.unitPrice.toLocaleString()}/kWh</span>}
                  {l.amountWon != null && <span> · 총 ₩{l.amountWon.toLocaleString()}</span>}
                  {l.kwh != null && <span> · {l.kwh}kWh</span>}
                  {l.odometer != null && <span> · {l.odometer.toLocaleString()}km</span>}
                </>
              ) : (
                <>
                  {l.unitPrice != null && <span>₩{l.unitPrice.toLocaleString()}/L</span>}
                  {l.amountWon != null && <span> · 총 ₩{l.amountWon.toLocaleString()}</span>}
                  {l.liters != null && <span> · {l.liters}L</span>}
                  {l.odometer != null && <span> · {l.odometer.toLocaleString()}km</span>}
                </>
              )}
              {l.unitPrice == null && l.amountWon == null && l.liters == null && l.kwh == null && (
                <span>방문 기록</span>
              )}
            </div>
            {l.memo && <div className="mt-1 text-xs text-gray-600">{l.memo}</div>}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-gray-400">금액·주유량은 마이페이지 &gt; 내 기록에서 편집할 수 있어요.</p>
    </section>
  );
}
