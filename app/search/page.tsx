'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BRAND_LABEL, BRAND_COLOR, PRODUCT_LABEL, type BrandCode, type ProductCode } from '@/types/station';
import { BackButton } from '@/components/common/BackButton';
import { useMapStore } from '@/stores/map';

interface Result {
  id: string; name: string; brand: BrandCode; address: string;
  lat: number; lng: number; isSelf: boolean; price: number | null;
  product: ProductCode;
}

function SearchInner() {
  const params = useSearchParams();
  const initialQ = params.get('q') ?? '';
  // 검색 페이지엔 별도 유종 전환 UI가 없다 — 홈 필터바에서 고른 유종을 그대로 따라간다.
  const product = useMapStore((s) => s.product);
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debouncedRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debouncedRef.current) clearTimeout(debouncedRef.current);
    if (q.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    debouncedRef.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}&product=${product}`)
        .then((r) => r.json())
        .then((d: { results?: Result[] }) => setResults(d.results ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => { if (debouncedRef.current) clearTimeout(debouncedRef.current); };
  }, [q, product]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <BackButton ariaLabel="뒤로 가기" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="주유소 이름 또는 주소"
          className="h-9 flex-1 rounded-full border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-primary focus:bg-white"
        />
      </header>

      {q.trim().length < 2 && (
        <p className="px-5 py-6 text-sm text-gray-400">두 글자 이상 입력해주세요.</p>
      )}
      {loading && <p className="px-5 py-6 text-sm text-gray-400">검색 중...</p>}

      {results && !loading && results.length === 0 && (
        <p className="px-5 py-6 text-sm text-gray-400">검색 결과가 없어요.</p>
      )}

      {results && results.length > 0 && (
        <>
          {/* 유종 컨텍스트 캡션 — 이 가격이 어느 유종 기준인지 리스트 상단 1줄로 고정 안내.
              비인터랙티브(유종 변경은 홈에서만) — 회색 소형 텍스트 유지. */}
          <p className="px-5 pb-1 pt-3 text-[11px] text-gray-500">
            가격은 {PRODUCT_LABEL[product]} 기준
          </p>
          <ul className="divide-y divide-gray-100">
            {results.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/station/${encodeURIComponent(r.id)}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: BRAND_COLOR[r.brand] ?? '#666' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center">
                      <span className="truncate text-sm font-semibold text-gray-900">{r.name}</span>
                      {r.isSelf && (
                        <span className="ml-1 shrink-0 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          셀프
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {BRAND_LABEL[r.brand]} · {r.address}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-gray-400">{PRODUCT_LABEL[r.product]}</div>
                    {r.price != null ? (
                      <div className="text-sm font-extrabold text-gray-900">
                        ₩{r.price.toLocaleString()}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">가격 정보 없음</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-gray-500">로딩 중...</div>}>
      <SearchInner />
    </Suspense>
  );
}
