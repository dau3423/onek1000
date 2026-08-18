'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { CheckIcon, PinIcon } from '@/components/icons';
import { useProductLabel } from '@/lib/i18n/labels';
import { type ProductCode } from '@/types/station';
import {
  INTEREST_REGION_MAX,
  INTEREST_REGION_DEFAULT_RADIUS_M,
  type InterestRegion,
} from '@/types/interest-region';

const PRODUCT_OPTIONS: ProductCode[] = ['B027', 'B034', 'D047', 'C004'];
const RADIUS_OPTIONS = [1000, 3000, 5000, 10000];

export function InterestRegionManager() {
  const t = useTranslations('my');
  const productLabel = useProductLabel();
  // 기본 차량 유종이 있으면 신규 등록 폼의 유종 디폴트로 사용
  const { data: session } = useSession();
  const [regions, setRegions] = useState<InterestRegion[] | null>(null);
  const [name, setName] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusM, setRadiusM] = useState(INTEREST_REGION_DEFAULT_RADIUS_M);
  const [product, setProduct] = useState<ProductCode>('B027');
  const [productTouched, setProductTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/interest-regions')
      .then((r) => r.json())
      .then((d) => setRegions(d.regions ?? []))
      .catch(() => setRegions([]));
  }, []);

  // 사용자가 직접 고른 적 없으면 기본 차량 유종으로 초기화
  useEffect(() => {
    const fuel = session?.user?.defaultProduct;
    if (fuel && !productTouched) setProduct(fuel);
  }, [session?.user?.defaultProduct, productTouched]);

  const useCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErr(t('interest.geoUnsupported'));
      return;
    }
    setLocating(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setErr(t('interest.geoDenied'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const add = async () => {
    if (!name.trim()) return setErr(t('interest.nameRequired'));
    if (!coords) return setErr(t('interest.coordsRequired'));
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/interest-regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), lat: coords.lat, lng: coords.lng, radiusM, product }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? t('registerFailed'));
      setRegions((prev) => [...(prev ?? []), d.region]);
      setName('');
      setCoords(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setRegions((prev) => (prev ?? []).filter((r) => r.id !== id));
    await fetch(`/api/interest-regions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  };

  const atLimit = (regions?.length ?? 0) >= INTEREST_REGION_MAX;

  return (
    <div className="space-y-5">
      {/* 안내 */}
      <p className="text-xs leading-relaxed text-gray-500">
        {t('interest.description')}
      </p>

      {/* 등록 목록 */}
      {regions === null ? (
        <p className="text-sm text-gray-400">{t('loading')}</p>
      ) : regions.length === 0 ? (
        <p className="text-sm text-gray-400">{t('interest.emptyMessage')}</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          {regions.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <PinIcon className="h-4 w-4 text-gray-500" />
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{r.name}</div>
                <div className="text-xs text-gray-500">
                  {productLabel(r.product)} · {t('interest.radiusOption', { radius: (r.radiusM / 1000).toLocaleString() })}
                </div>
              </div>
              <button
                onClick={() => remove(r.id)}
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
        <p className="text-xs text-gray-400">{t('interest.limitReached', { max: INTEREST_REGION_MAX })}</p>
      ) : (
        <div className="space-y-3 rounded-xl bg-gray-50 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder={t('interest.namePlaceholder')}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
          />

          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          >
            {locating ? (
              t('interest.locatingLabel')
            ) : coords ? (
              <>
                <CheckIcon className="h-3.5 w-3.5" />{t('interest.coordsReadyLabel')}
              </>
            ) : (
              <>
                <PinIcon className="h-4 w-4" />{t('interest.getLocationLabel')}
              </>
            )}
          </button>

          <div className="flex gap-2">
            <select
              value={product}
              onChange={(e) => { setProduct(e.target.value as ProductCode); setProductTouched(true); }}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
            >
              {PRODUCT_OPTIONS.map((p) => (
                <option key={p} value={p}>{productLabel(p)}</option>
              ))}
            </select>
            <select
              value={radiusM}
              onChange={(e) => setRadiusM(Number(e.target.value))}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
            >
              {RADIUS_OPTIONS.map((m) => (
                <option key={m} value={m}>{t('interest.radiusOption', { radius: (m / 1000).toLocaleString() })}</option>
              ))}
            </select>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}

          <button
            onClick={add}
            disabled={busy}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? t('registeringAction') : t('interest.addButtonLabel')}
          </button>
        </div>
      )}
    </div>
  );
}
