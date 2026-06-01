'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signIn } from 'next-auth/react';
import { loadKakao } from '@/components/map/loadKakao';
import { BRAND_LABEL, BRAND_COLOR, PRODUCT_LABEL, type BrandCode, type ProductCode, type StationWithPrice } from '@/types/station';

type Point = { lat: number; lng: number; name?: string };

type SearchResult = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export default function RouteCheapestPage() {
  const { status } = useSession();

  // 회원 전용(로그인 사용자 전용). 비로그인 시 로그인 CTA 노출.
  if (status === 'unauthenticated') {
    return <RouteSignInGate />;
  }
  // 세션 확인 중에는 깜빡임 방지용 간단 로딩
  if (status === 'loading') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center bg-white text-sm text-gray-400">
        불러오는 중...
      </main>
    );
  }

  return <RouteCheapestInner />;
}

/** 비로그인 사용자에게 보여줄 로그인 유도 화면 */
function RouteSignInGate() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100">
          ←
        </Link>
        <h1 className="font-bold text-gray-900">경로별 최저가</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <Image
          src="/icons/icon_run.png"
          alt=""
          width={56}
          height={56}
          className="opacity-80"
        />
        <h2 className="mt-4 text-lg font-bold text-gray-900">회원 전용 기능이에요</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          출발·도착을 잇는 경로 위 최저가 주유소 찾기는<br />
          로그인 후 이용할 수 있어요.
        </p>
        <button
          onClick={() => signIn(undefined, { callbackUrl: '/route' })}
          className="mt-6 w-full rounded-xl bg-primary py-3 font-bold text-white shadow-sm hover:opacity-90"
        >
          로그인하고 경로별 최저가 보기
        </button>
        <Link href="/" className="mt-3 text-xs text-gray-400 hover:underline">
          지도로 돌아가기
        </Link>
      </div>
    </main>
  );
}

function RouteCheapestInner() {
  const [from, setFrom] = useState<Point | null>(null);
  const [to, setTo] = useState<Point | null>(null);
  const [product, setProduct] = useState<ProductCode>('B027');
  const [results, setResults] = useState<StationWithPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickMyLocation = (which: 'from' | 'to') => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const v: Point = { lat: p.coords.latitude, lng: p.coords.longitude, name: '내 위치' };
        which === 'from' ? setFrom(v) : setTo(v);
      },
      () => alert('위치 권한이 필요합니다.'),
    );
  };

  const setPoint = (which: 'from' | 'to', v: Point) => {
    which === 'from' ? setFrom(v) : setTo(v);
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
          onSelect={(p) => setPoint('from', p)}
        />
        <PointPicker
          label="도착"
          value={to}
          onMyLocation={() => pickMyLocation('to')}
          onSelect={(p) => setPoint('to', p)}
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
  label, value, onMyLocation, onSelect,
}: {
  label: string;
  value: Point | null;
  onMyLocation: () => void;
  onSelect: (p: Point) => void;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const runSearch = async () => {
    const keyword = query.trim();
    if (!keyword) return;
    setSearching(true);
    setSearchError(null);
    setPlaces(null);
    try {
      const kakao = await loadKakao();
      if (!kakao.maps.services?.Places) {
        throw new Error('장소 검색을 사용할 수 없습니다. "내 위치"를 이용해주세요.');
      }
      const ps = new kakao.maps.services.Places();
      ps.keywordSearch(keyword, (data, status) => {
        setSearching(false);
        if (status === kakao.maps.services.Status.OK) {
          setPlaces(
            data.map((d) => ({
              id: d.id,
              name: d.place_name,
              address: d.road_address_name || d.address_name,
              lat: parseFloat(d.y),
              lng: parseFloat(d.x),
            })),
          );
        } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
          setPlaces([]);
        } else {
          setSearchError('검색 중 오류가 발생했어요. 다시 시도해주세요.');
        }
      });
    } catch (e) {
      setSearching(false);
      setSearchError(e instanceof Error ? e.message : '장소 검색에 실패했어요.');
    }
  };

  const handleSelect = (p: SearchResult) => {
    onSelect({ lat: p.lat, lng: p.lng, name: p.name });
    setQuery('');
    setPlaces(null);
    setSearchError(null);
  };

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
        {value && (
          <span className="min-w-0 truncate text-right text-[11px] text-gray-600">
            {value.name ? (
              <>
                <span className="font-semibold text-gray-700">{value.name}</span>
                <span className="ml-1 text-gray-400">
                  {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
                </span>
              </>
            ) : (
              <>{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</>
            )}
          </span>
        )}
      </div>

      <div className="mb-2 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runSearch();
            }
          }}
          placeholder="장소·주소 검색 (예: 강남역)"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:bg-white focus:outline-none"
          enterKeyHint="search"
        />
        <button
          onClick={runSearch}
          disabled={searching || !query.trim()}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {searching ? '검색…' : '검색'}
        </button>
      </div>

      {searchError && <p className="mb-2 text-[11px] text-red-500">{searchError}</p>}

      {places !== null && (
        <div className="mb-2 max-h-56 overflow-y-auto rounded-lg border border-gray-100">
          {places.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400">검색 결과가 없어요.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {places.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => handleSelect(p)}
                    className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="truncate text-sm font-semibold text-gray-900">{p.name}</div>
                    <div className="truncate text-[11px] text-gray-500">{p.address}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button onClick={onMyLocation} className="w-full rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">
        📍 내 위치
      </button>
    </div>
  );
}
