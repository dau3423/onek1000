'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { StarRating } from './StarRating';
import { ReportButton } from './ReportButton';
import type { Review } from '@/types/review';

interface Props {
  reviews: Review[];
  onDeleted?: (id: string) => void;
  onReported?: (id: string) => void;
}

export function ReviewList({ reviews, onDeleted, onReported }: Props) {
  const t = useTranslations('review');
  const locale = useLocale();
  const router = useRouter();
  const { status } = useSession();
  const [openImage, setOpenImage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (reviews.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-gray-400">
        {t('none')}
      </p>
    );
  }

  const onDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      onDeleted?.(id);
      router.refresh();
    } catch (e) {
      alert(t('deleteFailed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <ul className="divide-y divide-gray-100">
        {reviews.map((r) => {
          const displayName = r.user.nickname ?? r.user.name ?? t('anonymous');
          return (
          <li key={r.id} className="py-4">
            <div className="flex items-start gap-3">
              {r.user.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.user.imageUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                  {displayName[0] ?? '·'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">
                      {displayName}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {formatRelative(r.createdAt, locale, t('justNow'))}
                    </span>
                  </div>
                  {/* 본인 리뷰는 신고 불가(서버 400)라 렌더하지 않고, 비로그인은 눌러도 401이라 숨긴다 */}
                  {!r.isMine && status === 'authenticated' && (
                    <ReportButton
                      reviewId={r.id}
                      onReported={(id) => onReported?.(id)}
                    />
                  )}
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
                    {busyId === r.id ? t('deleting') : t('deleteMine')}
                  </button>
                )}
              </div>
            </div>
          </li>
          );
        })}
      </ul>

      {openImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpenImage(null)}
          role="dialog"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={openImage} alt={t('photoAlt')} className="max-h-[90vh] max-w-full rounded-lg" />
        </div>
      )}
    </>
  );
}

// 상대 시각 표기: 1분 미만은 "방금"(고정 문구), 이후는 Intl.RelativeTimeFormat으로 로케일에 맞게
// "N분/시간/일 전"을 생성한다(ko 결과는 기존 수기 포맷과 바이트 동일 — numeric:'always' 확인됨).
// 7일 이상이면 로케일별 월.일 숫자 포맷으로 대체(과거 'ko-KR' 고정값 대신 현재 로케일 사용).
function formatRelative(iso: string, locale: string, justNow: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const sec = Math.floor((now - t) / 1000);
  if (sec < 60) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const h = Math.floor(min / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  const d = Math.floor(h / 24);
  if (d < 7) return rtf.format(-d, 'day');
  return new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(new Date(iso));
}
