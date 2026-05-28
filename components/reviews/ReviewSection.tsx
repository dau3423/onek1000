'use client';

// 주유소 상세 페이지에 들어가는 리뷰 섹션 — 통계/목록/작성을 한 번에 관리

import { useEffect, useState, useCallback } from 'react';
import { StarRating } from './StarRating';
import { ReviewList } from './ReviewList';
import { ReviewForm } from './ReviewForm';
import type { Review, ReviewStats } from '@/types/review';

interface Props { stationId: string }

export function ReviewSection({ stationId }: Props) {
  const [data, setData] = useState<{ reviews: Review[]; stats: ReviewStats } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/stations/${stationId}/reviews`);
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e) {
      setError('리뷰 로드 실패: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, [stationId]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="border-t border-gray-100 px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800">리뷰</h2>
        {!writing && data && (
          <button
            onClick={() => setWriting(true)}
            className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-white"
          >
            ✍️ 리뷰 쓰기
          </button>
        )}
      </div>

      {/* 통계 */}
      {data && data.stats.count > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <div className="text-center">
            <div className="text-xl font-extrabold text-gray-900">
              {data.stats.average.toFixed(1)}
            </div>
            <StarRating value={data.stats.average} size="sm" readOnly />
          </div>
          <div className="h-10 w-px bg-gray-200" />
          <div className="flex-1">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = data.stats.distribution[n as 1 | 2 | 3 | 4 | 5];
              const pct = data.stats.count ? (c / data.stats.count) * 100 : 0;
              return (
                <div key={n} className="flex items-center gap-2 text-[11px]">
                  <span className="w-3 text-gray-500">{n}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-5 text-right text-gray-400">{c}</span>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-gray-500">{data.stats.count}건</div>
        </div>
      )}

      {/* 작성 폼 */}
      {writing && (
        <div className="mb-4">
          <ReviewForm
            stationId={stationId}
            onCreated={() => { setWriting(false); load(); }}
            onCancel={() => setWriting(false)}
          />
        </div>
      )}

      {/* 목록 */}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {!data && !error && <p className="py-6 text-center text-sm text-gray-400">로딩 중…</p>}
      {data && (
        <ReviewList
          reviews={data.reviews}
          onDeleted={() => load()}
        />
      )}
    </section>
  );
}
