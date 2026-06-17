'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { loadKakao } from '@/components/map/loadKakao';
import { ROUTE_ENTRY_FLAG } from '@/components/route/RouteLoginPrompt';
import { useMapStore } from '@/stores/map';
import { BRAND_LABEL, BRAND_COLOR, PRODUCT_LABEL, type BrandCode, type ProductCode, type StationWithPrice } from '@/types/station';
import {
  getRecentPlaces,
  recordRecentPlace,
  removeRecentPlace,
  toRoutePoint,
  type RecentPlace,
} from '@/lib/route/recentPlaces';

// placeId: 카카오 장소 id(최근 위치 동일성 판정용). "내 위치"처럼 검색 외 지정엔 없음.
type Point = { lat: number; lng: number; name?: string; placeId?: string };

/** 경로 화면이 지원하는 유종 선택지(휘발유/경유/LPG). */
const ROUTE_PRODUCTS: ProductCode[] = ['B027', 'D047', 'C004'];

/**
 * 기본 차량 유종을 경로 화면 선택지(B027/D047/C004)로 매핑한다.
 * 선택지 밖 값(B034 고급휘발유 → 휘발유 계열 B027, K015 등유 등 → 기본 B027)은
 * 어색하지 않게 폴백한다. 매핑 불가/없음이면 null(기존 B027 유지).
 */
function toRouteProduct(fuel?: ProductCode): ProductCode | null {
  if (!fuel) return null;
  if (ROUTE_PRODUCTS.includes(fuel)) return fuel; // 그대로 지원되는 유종
  if (fuel === 'B034') return 'B027'; // 고급휘발유 → 휘발유 계열
  return 'B027'; // 등유(K015) 등 그 외는 휘발유로 폴백
}

type SearchResult = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export default function RouteCheapestPage() {
  const { status } = useSession();

  // 경로별 최저가는 비회원에게도 완전 개방(진입·입력·검색·결과까지). 로그인 유도 없음.
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

function RouteCheapestInner() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const setRoutePlan = useMapStore((s) => s.setRoutePlan);
  const [from, setFrom] = useState<Point | null>(null);
  const [to, setTo] = useState<Point | null>(null);
  const [product, setProduct] = useState<ProductCode>('B027');
  const [productTouched, setProductTouched] = useState(false);
  const [results, setResults] = useState<StationWithPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 최근/자주 탐색한 위치(클라이언트 localStorage). SSR 안전을 위해 마운트 후 로드.
  const [recent, setRecent] = useState<RecentPlace[]>([]);

  useEffect(() => {
    setRecent(getRecentPlaces());
  }, []);

  // 로그인 + 기본 차량 유종이 있으면 진입 시 1회 자동 선택(선택지 밖 값은 폴백 매핑).
  // 사용자가 직접 유종을 바꾼 뒤에는 덮어쓰지 않는다(productTouched 가드).
  useEffect(() => {
    if (productTouched) return;
    const mapped = toRouteProduct(session?.user?.defaultProduct);
    if (mapped) setProduct(mapped);
  }, [session?.user?.defaultProduct, productTouched]);

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
    // 경로별 최저가는 비회원에게도 완전 개방한다(가입 전 가치 체험 → 전환 개선).
    // 입력·장소검색·경로 검색·최저가 결과 보기까지 로그인 없이 사용 가능.
    // 우리 DB + 서버 경유 directions 조회라 클라이언트 인증과 무관하다.
    // (외부 길안내 시작(NaviButton)만 별도로 회원 가드를 유지한다 — 메인 지도 측에서 처리.)
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
      const stations: StationWithPrice[] = j.stations ?? [];
      // 도로 경로 점들(directions 성공 시 도로 따라, 실패 시 출발/도착 직선 2점).
      const path: { lat: number; lng: number }[] =
        Array.isArray(j.path) && j.path.length >= 2
          ? j.path
          : [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }];
      setResults(stations);
      if (stations.length === 0) {
        // 경로 주변에 주유소가 없으면 지도로 보낼 게 없으므로 페이지에 머물며 안내.
        setError('경로 반경 2km 내 주유소를 찾지 못했어요. 출발/도착을 조정해보세요.');
        return;
      }
      // 탐색한 위치를 최근/자주 목록에 기록(중복은 count++ & lastAt 갱신).
      // - 도착지(to)는 항상 기록 대상. 출발지(from)도 별도 항목으로 기록한다.
      // - 단 "내 위치/현재위치" 같은 동적 항목과 이름 없는 좌표는 제외(재사용 의미 없음).
      const isStaticPlace = (p: Point) =>
        !!p.name && p.name !== '내 위치' && p.name !== '현재위치';
      if (isStaticPlace(to)) {
        recordRecentPlace({ placeId: to.placeId, name: to.name as string, lat: to.lat, lng: to.lng });
      }
      if (isStaticPlace(from)) {
        recordRecentPlace({ placeId: from.placeId, name: from.name as string, lat: from.lat, lng: from.lng });
      }
      setRecent(getRecentPlaces());

      // 결과를 store에 담아 메인 지도로 이동 → 도로 경로 Polyline + 출발/도착/최저가 마커 표시.
      setRoutePlan({
        from: { lat: from.lat, lng: from.lng, name: from.name },
        to: { lat: to.lat, lng: to.lng, name: to.name },
        product,
        stations,
        path,
      });
      // 비회원이 "경로 위 최저가 찾기"로 지도에 진입하면, 지도 화면에서 5초 뒤 로그인 유도
      // 팝업(RouteLoginPrompt)을 띄우기 위한 플래그를 세운다. 로그인 사용자는 세우지 않는다.
      if (authStatus === 'unauthenticated') {
        try {
          window.sessionStorage.setItem(ROUTE_ENTRY_FLAG, '1');
        } catch {
          /* 프라이빗 모드 등 sessionStorage 불가: 팝업 생략(앱 동작 영향 없음) */
        }
      }
      router.push('/');
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
          {ROUTE_PRODUCTS.map((p) => (
            <button
              key={p}
              onClick={() => { setProductTouched(true); setProduct(p); }}
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

      {recent.length > 0 && (
        <section className="border-t border-gray-100 px-5 py-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
            최근·자주 가는 위치
          </h2>
          <ul className="flex flex-wrap gap-2">
            {recent.map((p) => (
              <li key={`${p.placeId ?? ''}|${p.name}|${p.lat},${p.lng}`}>
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 pl-3 pr-1 text-xs">
                  <button
                    type="button"
                    // 클릭 시 도착지(to)에 좌표·이름 포함해 채워 바로 재검색 가능하게.
                    onClick={() => setPoint('to', toRoutePoint(p))}
                    className="max-w-[10rem] truncate py-1.5 font-semibold text-gray-800 hover:text-primary"
                    title={`${p.name} · ${p.count}회`}
                  >
                    {p.name}
                    {p.count > 1 && <span className="ml-1 text-gray-400">{p.count}회</span>}
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.name} 삭제`}
                    onClick={() => setRecent(removeRecentPlace(p))}
                    className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-gray-100">
        {results.length === 0 && !loading && (
          <p className="px-5 py-6 text-sm text-gray-400">
            도로 경로 반경 2km 내 주유소를 찾아드려요.
          </p>
        )}
        <ul className="divide-y divide-gray-100">
          {results.map((s, i) => (
            <li key={s.id}>
              <Link href={`/station/${encodeURIComponent(s.id)}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
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

  // 외부에서 확정된 지점(value)의 이름을 입력란에 반영한다.
  // - "내 위치" 선택 → 입력란에 "📍 내 위치" 표시(좌표만 잡히던 모호함 해소)
  // - 장소 검색 후 선택 → 그 장소명으로 덮어쓰기
  // 부모는 지점 확정 시마다 새 객체를 만들므로, value 참조가 바뀔 때만 동기화한다.
  // (사용자가 입력란에 직접 타이핑하는 동안에는 value가 그대로라 검색어가 보존된다.)
  const lastSyncedValue = useRef<Point | null>(null);
  useEffect(() => {
    if (value === lastSyncedValue.current) return;
    lastSyncedValue.current = value;
    if (value?.name) {
      setQuery(value.name === '내 위치' ? '📍 내 위치' : value.name);
    }
  }, [value]);

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
    // placeId(카카오 장소 id)도 함께 넘겨 최근 위치 동일성 판정 정확도를 높인다.
    onSelect({ lat: p.lat, lng: p.lng, name: p.name, placeId: p.id });
    // 입력란 표시는 value 동기화 effect가 선택한 장소명으로 채운다(여기서 비우지 않음).
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
