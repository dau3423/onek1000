'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import { VEHICLE_MAX, type Vehicle } from '@/types/vehicle';

const FUEL_OPTIONS: ProductCode[] = ['B027', 'B034', 'D047', 'C004'];

export function VehicleManager() {
  // 세션 update()로 기본 유종 변경을 즉시 토큰에 반영(다음 페이지 진입 시 자동 선택)
  const { update } = useSession();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [name, setName] = useState('');
  const [fuel, setFuel] = useState<ProductCode>('B027');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/vehicles')
      .then((r) => r.json())
      .then((d) => setVehicles(d.vehicles ?? []))
      .catch(() => setVehicles([]));
  }, []);

  const add = async () => {
    if (!name.trim()) return setErr('차량 이름을 입력해 주세요. (예: 내 차)');
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), fuel }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '등록에 실패했어요.');
      setVehicles((prev) => {
        const next = [...(prev ?? []), d.vehicle as Vehicle];
        // 새로 추가된 차가 기본이면 나머지는 기본 해제
        return d.vehicle.isDefault ? next.map((v) => ({ ...v, isDefault: v.id === d.vehicle.id })) : next;
      });
      setName('');
      if (d.vehicle?.isDefault) await update();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setDefault = async (id: string) => {
    setVehicles((prev) => (prev ?? []).map((v) => ({ ...v, isDefault: v.id === id })));
    await fetch('/api/vehicles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await update();
  };

  const remove = async (id: string) => {
    const wasDefault = (vehicles ?? []).find((v) => v.id === id)?.isDefault;
    setVehicles((prev) => {
      const rest = (prev ?? []).filter((v) => v.id !== id);
      // 기본 차량을 지웠으면 남은 가장 오래된 차를 기본으로 (서버 로직과 일치)
      if (wasDefault && rest.length > 0 && !rest.some((v) => v.isDefault)) {
        rest[0] = { ...rest[0], isDefault: true };
      }
      return rest;
    });
    await fetch(`/api/vehicles?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (wasDefault) await update();
  };

  const atLimit = (vehicles?.length ?? 0) >= VEHICLE_MAX;

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-gray-500">
        차량의 기름 종류를 등록하면, 지도와 가격 필터의 기본 유종으로 자동 선택돼요.
        여러 대를 등록한 경우 기본 차량의 유종이 적용됩니다.
      </p>

      {/* 등록 목록 */}
      {vehicles === null ? (
        <p className="text-sm text-gray-400">불러오는 중…</p>
      ) : vehicles.length === 0 ? (
        <p className="text-sm text-gray-400">아직 등록한 차량이 없어요.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          {vehicles.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-lg">🚗</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{v.name}</span>
                  {v.isDefault && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">기본</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{PRODUCT_LABEL[v.fuel]}</div>
              </div>
              {!v.isDefault && (
                <button
                  onClick={() => setDefault(v.id)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  기본 지정
                </button>
              )}
              <button
                onClick={() => remove(v.id)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 등록 폼 */}
      {atLimit ? (
        <p className="text-xs text-gray-400">차량은 최대 {VEHICLE_MAX}대까지 등록할 수 있어요.</p>
      ) : (
        <div className="space-y-3 rounded-xl bg-gray-50 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="차량 이름 (예: 내 차)"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
          />
          <select
            value={fuel}
            onChange={(e) => setFuel(e.target.value as ProductCode)}
            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
          >
            {FUEL_OPTIONS.map((p) => (
              <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>
            ))}
          </select>

          {err && <p className="text-xs text-red-500">{err}</p>}

          <button
            onClick={add}
            disabled={busy}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? '등록 중…' : '차량 추가'}
          </button>
        </div>
      )}
    </div>
  );
}
