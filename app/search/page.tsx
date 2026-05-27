'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BRAND_LABEL, BRAND_COLOR, type BrandCode } from '@/types/station';

interface Result {
  id: string; name: string; brand: BrandCode; address: string;
  lat: number; lng: number; isSelf: boolean; price: number | null;
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debouncedRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debouncedRef.current) clearTimeout(debouncedRef.current);
    if (q.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    debouncedRef.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d: { results?: Result[] }) => setResults(d.results ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => { if (debouncedRef.current) clearTimeout(debouncedRef.current); };
  }, [q]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 backdrop-blur">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100"
        >
          ←
        </button>
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
        <ul className="divide-y divide-gray-100">
          {results.map((r) => (
            <li key={r.id}>
              <Link
                href={`/station/${r.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: BRAND_COLOR[r.brand] ?? '#666' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-900">{r.name}</div>
                  <div className="truncate text-xs text-gray-500">
                    {BRAND_LABEL[r.brand]} · {r.address}
                  </div>
                </div>
                {r.price != null && (
                  <div className="text-sm font-extrabold text-gray-900">
                    ₩{r.price.toLocaleString()}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
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
