'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BRAND_LABEL, BRAND_COLOR, PRODUCT_LABEL, type BrandCode, type ProductCode, type StationWithPrice } from '@/types/station';

const SEOUL_CITY_HALL = { lat: 37.5663, lng: 126.9779 };

export default function RouteCheapestPage() {
  const [from, setFrom] = useState<{ lat: number; lng: number } | null>(null);
  const [to, setTo] = useState<{ lat: number; lng: number } | null>(null);
  const [product, setProduct] = useState<ProductCode>('B027');
  const [results, setResults] = useState<StationWithPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickMyLocation = (which: 'from' | 'to') => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const v = { lat: p.coords.latitude, lng: p.coords.longitude };
        which === 'from' ? setFrom(v) : setTo(v);
      },
      () => alert('위치 권한이 필요합니다.'),
    );
  };

  const pickSeoul = (which: 'from' | 'to') => {
    which === 'from' ? setFrom(SEOUL_CITY_HALL) : setTo(SEOUL_CITY_HALL);
  };

  const search = async () => {
    if (!from || !to) { setError('출발/도착을 먼저 지정해주세요.'); return; }
    setError(null); setLoading(true);
    try {
      const q = new URLSearchParams({
        fromLat: String(from.lat), fromLng: String(from.lng),
        toLat: String(to.lat), toLng: String(to.lng),
        product, buffer: '2000', limit: '10',
      });
      const res = await fetch(`/api/route-cheapest?${q}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '검색 실패');
      setResults(j.stations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="font-bold text-gray-900">경로별 최저가</h1>
      </header>

      <section className="space-y-3 px-5 py-4">
        <PointPicker
          label="출발"
          value={from}
          onMyLocation={() => pickMyLocation('from')}
          onPreset={() => pickSeoul('from')}
        />
        <PointPicker
          label="도착"
          value={to}
          onMyLocation={() => pickMyLocation('to')}
          onPreset={() => pickSeoul('to')}
        />

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(['B027', 'D047', 'C004'] as ProductCode[]).map((p) => (
            <button
              key={p}
              onClick={() => setProduct(p)}
              className={
                product === p
                  ? 'shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white'
                  : 'shrink-0 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700'
              }
            >
              {PRODUCT_LABEL[p]}
            </button>
          ))}
        </div>

        <button
          onClick={search}
          disabled={loading}
          className="w-full rounded-xl bg-primary py-3 font-bold text-white shadow-sm disabled:opacity-60"
        >
          {loading ? '검색 중...' : '경로 위 최저가 찾기'}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </section>

      <section className="border-t border-gray-100">
        {results.length === 0 && !loading && (
          <p className="px-5 py-6 text-sm text-gray-400">
            경로(직선)에서 반경 2km 내 주유소를 찾아드려요.
          </p>
        )}
        <ul className="divide-y divide-gray-100">
          {results.map((s, i) => (
            <li key={s.id}>
              <Link href={`/station/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                <span className="w-5 text-center text-xs font-bold text-gray-500">{i + 1}</span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: BRAND_COLOR[(s.brand as BrandCode) ?? 'ETC'] ?? '#666' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-900">{s.name}</div>
                  <div className="truncate text-xs text-gray-500">
                    {BRAND_LABEL[s.brand]} · 경로에서 {s.distance ? Math.round(s.distance) : '-'}m
                  </div>
                </div>
                <div className="text-sm font-extrabold text-gray-900">
                  ₩{s.price.toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function PointPicker({
  label, value, onMyLocation, onPreset,
}: {
  label: string;
  value: { lat: number; lng: number } | null;
  onMyLocation: () => void;
  onPreset: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
        {value && (
          <span className="text-[11px] text-gray-500">
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onMyLocation} className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">
          📍 내 위치
        </button>
        <button onClick={onPreset} className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">
          서울시청
        </button>
      </div>
    </div>
  );
}
