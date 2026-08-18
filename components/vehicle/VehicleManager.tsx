'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { CarIcon } from '@/components/icons';
import { useProductLabel } from '@/lib/i18n/labels';
import { type ProductCode } from '@/types/station';
import { VEHICLE_MAX, type Vehicle } from '@/types/vehicle';

const FUEL_OPTIONS: ProductCode[] = ['B027', 'B034', 'D047', 'C004'];

export function VehicleManager() {
  const t = useTranslations('my');
  const productLabel = useProductLabel();
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
    if (!name.trim()) return setErr(t('vehicle.nameRequired'));
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), fuel }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? t('registerFailed'));
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
        {t('vehicle.description')}
      </p>

      {/* 등록 목록 */}
      {vehicles === null ? (
        <p className="text-sm text-gray-400">{t('loading')}</p>
      ) : vehicles.length === 0 ? (
        <p className="text-sm text-gray-400">{t('vehicle.emptyMessage')}</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          {vehicles.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-4 py-3">
              <CarIcon className="h-5 w-5 text-gray-500" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{v.name}</span>
                  {v.isDefault && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{t('vehicle.defaultBadge')}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{productLabel(v.fuel)}</div>
              </div>
              {!v.isDefault && (
                <button
                  onClick={() => setDefault(v.id)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  {t('vehicle.setDefaultAction')}
                </button>
              )}
              <button
                onClick={() => remove(v.id)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50"
              >
                {t('deleteAction')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 등록 폼 */}
      {atLimit ? (
        <p className="text-xs text-gray-400">{t('vehicle.limitReached', { max: VEHICLE_MAX })}</p>
      ) : (
        <div className="space-y-3 rounded-xl bg-gray-50 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder={t('vehicle.namePlaceholder')}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
          />
          <select
            value={fuel}
            onChange={(e) => setFuel(e.target.value as ProductCode)}
            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
          >
            {FUEL_OPTIONS.map((p) => (
              <option key={p} value={p}>{productLabel(p)}</option>
            ))}
          </select>

          {err && <p className="text-xs text-red-500">{err}</p>}

          <button
            onClick={add}
            disabled={busy}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? t('registeringAction') : t('vehicle.addButtonLabel')}
          </button>
        </div>
      )}
    </div>
  );
}
