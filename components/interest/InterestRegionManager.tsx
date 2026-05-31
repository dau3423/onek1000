'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import {
  INTEREST_REGION_MAX,
  INTEREST_REGION_DEFAULT_RADIUS_M,
  type InterestRegion,
} from '@/types/interest-region';

const PRODUCT_OPTIONS: ProductCode[] = ['B027', 'B034', 'D047', 'C004'];
const RADIUS_OPTIONS = [1000, 3000, 5000, 10000];

export function InterestRegionManager() {
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
      setErr('이 브라우저에서는 위치를 사용할 수 없어요.');
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
        setErr('위치 권한을 허용해 주세요.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const add = async () => {
    if (!name.trim()) return setErr('이름을 입력해 주세요. (예: 집)');
    if (!coords) return setErr('현재 위치를 먼저 가져와 주세요.');
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/interest-regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), lat: coords.lat, lng: coords.lng, radiusM, product }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '등록에 실패했어요.');
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
        집·회사처럼 자주 가는 곳을 등록하면, 그 반경 안에서 최저가가 떨어지거나 1위 주유소가 바뀔 때
        푸시 알림을 보내드려요. (알림 수신은 마이페이지에서 푸시를 켜야 동작해요.)
      </p>

      {/* 등록 목록 */}
      {regions === null ? (
        <p className="text-sm text-gray-400">불러오는 중…</p>
      ) : regions.length === 0 ? (
        <p className="text-sm text-gray-400">아직 등록한 관심 지역이 없어요.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          {regions.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-lg">📍</span>
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{r.name}</div>
                <div className="text-xs text-gray-500">
                  {PRODUCT_LABEL[r.product]} · 반경 {(r.radiusM / 1000).toLocaleString()}km
                </div>
              </div>
              <button
                onClick={() => remove(r.id)}
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
        <p className="text-xs text-gray-400">관심 지역은 최대 {INTEREST_REGION_MAX}개까지 등록할 수 있어요.</p>
      ) : (
        <div className="space-y-3 rounded-xl bg-gray-50 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="이름 (예: 집, 회사)"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
          />

          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          >
            {locating ? '위치 확인 중…' : coords ? '✓ 현재 위치 사용 중 (다시 가져오기)' : '📍 현재 위치 가져오기'}
          </button>

          <div className="flex gap-2">
            <select
              value={product}
              onChange={(e) => { setProduct(e.target.value as ProductCode); setProductTouched(true); }}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
            >
              {PRODUCT_OPTIONS.map((p) => (
                <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>
              ))}
            </select>
            <select
              value={radiusM}
              onChange={(e) => setRadiusM(Number(e.target.value))}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
            >
              {RADIUS_OPTIONS.map((m) => (
                <option key={m} value={m}>반경 {(m / 1000).toLocaleString()}km</option>
              ))}
            </select>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}

          <button
            onClick={add}
            disabled={busy}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? '등록 중…' : '관심 지역 추가'}
          </button>
        </div>
      )}
    </div>
  );
}
