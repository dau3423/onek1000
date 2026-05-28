'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StarRating } from './StarRating';
import type { Review } from '@/types/review';

interface Props {
  reviews: Review[];
  onDeleted?: (id: string) => void;
}

export function ReviewList({ reviews, onDeleted }: Props) {
  const router = useRouter();
  const [openImage, setOpenImage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (reviews.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-gray-400">
        아직 리뷰가 없어요. 첫 리뷰를 남겨보세요.
      </p>
    );
  }

  const onDelete = async (id: string) => {
    if (!confirm('이 리뷰를 삭제할까요?')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      onDeleted?.(id);
      router.refresh();
    } catch (e) {
      alert('삭제 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <ul className="divide-y divide-gray-100">
        {reviews.map((r) => (
          <li key={r.id} className="py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                {r.user.name?.[0] ?? '·'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900">
                    {r.user.name ?? '익명'}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {formatRelative(r.createdAt)}
                  </span>
                </div>
                <div className="mt-0.5">
                  <StarRating value={r.rating} size="sm" readOnly />
                </div>
                {r.content && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {r.content}
                  </p>
                )}
                {r.photoUrls.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.photoUrls.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setOpenImage(url)}
                        className="h-20 w-20 overflow-hidden rounded-lg bg-gray-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
                {r.isMine && (
                  <button
                    onClick={() => onDelete(r.id)}
                    disabled={busyId === r.id}
                    className="mt-2 text-[11px] text-red-500 hover:underline disabled:opacity-50"
                  >
                    {busyId === r.id ? '삭제 중…' : '내 리뷰 삭제'}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {openImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpenImage(null)}
          role="dialog"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={openImage} alt="리뷰 사진" className="max-h-[90vh] max-w-full rounded-lg" />
        </div>
      )}
    </>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const sec = Math.floor((now - t) / 1000);
  if (sec < 60) return '방금';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}
