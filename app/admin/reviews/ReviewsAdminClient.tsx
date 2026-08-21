'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminQueueItem, AdminReportItem, AdminReviewSummary, ModerationQueue } from '@/types/admin-review';
import type { PlaceType, ReportReason } from '@/types/review';

const PLACE_LABEL: Record<PlaceType, string> = {
  gas: '주유소',
  ev: '전기차 충전소',
  carwash: '세차장',
  repair: '정비소',
};

const REASON_LABEL: Record<ReportReason, string> = {
  spam: '스팸/광고',
  abuse: '욕설/혐오',
  irrelevant: '무관한 내용',
  false_info: '허위 정보',
  other: '기타',
};

function personLabel(p: { nickname: string | null; name: string | null; email: string | null }): string {
  return p.nickname || p.name || p.email || '(알 수 없음)';
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * 신고 모더레이션 화면(운영자용).
 *  - 마운트 시 GET /api/admin/reviews/reports 로 대기열(pending)/숨김 목록(hidden)을 불러온다.
 *  - [숨김]: PATCH /api/admin/reviews/[id] { hidden:true } — 서버가 그 리뷰의 미처리 신고도 함께 처리한다.
 *  - [기각]: 카드에 나열된 신고 전부를 POST .../reports/[id]/dismiss 로 개별 해제(리뷰는 그대로).
 *  - [숨김 해제]: PATCH ... { hidden:false }.
 *  - 액션 후에는 다시 목록을 불러온다(낙관적 갱신 대신 — 운영 도구라 정확성 우선).
 */
export function ReviewsAdminClient() {
  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch('/api/admin/reviews/reports', { cache: 'no-store' });
      if (!r.ok) throw new Error(`목록을 불러오지 못했습니다 (${r.status})`);
      const j = (await r.json()) as ModerationQueue;
      setQueue(j);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function hideReview(id: string, hidden: boolean) {
    setBusyId(id);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `처리 실패 (${r.status})`);
      setMsg({ kind: 'ok', text: hidden ? '리뷰를 숨겼습니다. 남아있던 신고도 함께 처리 완료로 표시했습니다.' : '숨김을 해제했습니다.' });
      await load();
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  async function dismissCard(reviewId: string, reports: AdminReportItem[]) {
    setBusyId(reviewId);
    setMsg(null);
    try {
      const results = await Promise.all(
        reports.map((rep) => fetch(`/api/admin/reviews/reports/${rep.id}/dismiss`, { method: 'POST' })),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) throw new Error(`일부 신고 처리에 실패했습니다 (${failed.length}/${results.length})`);
      setMsg({ kind: 'ok', text: `신고 ${reports.length}건을 기각했습니다. 리뷰는 그대로 노출됩니다.` });
      await load();
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    // 관리 도구는 가독성 우선 — 라이트 배경+진한 글자로 고정.
    <main
      className="mx-auto min-h-dvh max-w-3xl bg-gray-50 px-4 py-8 text-gray-900"
      style={{ colorScheme: 'light' }}
    >
      <header className="mb-6">
        <p className="text-xs font-medium text-gray-500">운영자용 · 리뷰 신고 처리</p>
        <h1 className="mt-1 text-xl font-extrabold text-gray-900">🚩 리뷰 신고 관리</h1>
        <p className="mt-1 text-xs text-gray-500">
          자동 숨김은 없습니다. 신고 내용과 신고자를 확인하고 직접 숨김/기각을 판단하세요.
        </p>
      </header>

      {msg && (
        <p className={`mb-4 text-sm font-medium ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}

      {loading && <p className="py-8 text-center text-sm text-gray-500">불러오는 중…</p>}

      {!loading && loadError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>
      )}

      {!loading && !loadError && queue && (
        <>
          {queue.reportsTableMissing && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              신고 테이블(review_reports)이 아직 없습니다. 마이그레이션 0041을 적용하면 신고 대기열이
              여기 표시됩니다. 아래 &quot;숨김 처리된 리뷰&quot; 목록은 이 상태에서도 정상 동작합니다.
            </p>
          )}

          {/* 대기 중 신고 */}
          <section aria-label="대기 중 신고" className="mb-8">
            <h2 className="mb-3 text-sm font-bold text-gray-700">대기 중 신고 ({queue.pending.length})</h2>
            {queue.pending.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                처리할 신고가 없습니다.
              </p>
            ) : (
              <ul className="space-y-4">
                {queue.pending.map((item) => (
                  <PendingCard
                    key={item.review.id}
                    item={item}
                    busy={busyId === item.review.id}
                    onHide={() => hideReview(item.review.id, true)}
                    onDismiss={() => dismissCard(item.review.id, item.reports)}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* 숨김 처리된 리뷰 */}
          <section aria-label="숨김 처리된 리뷰">
            <h2 className="mb-3 text-sm font-bold text-gray-700">숨김 처리된 리뷰 ({queue.hidden.length})</h2>
            {queue.hidden.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                숨긴 리뷰가 없습니다.
              </p>
            ) : (
              <ul className="space-y-4">
                {queue.hidden.map((review) => (
                  <HiddenCard
                    key={review.id}
                    review={review}
                    busy={busyId === review.id}
                    onUnhide={() => hideReview(review.id, false)}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function PlaceBadge({ review }: { review: AdminReviewSummary }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">
      {PLACE_LABEL[review.targetType] ?? review.targetType}
      <span className="font-normal text-gray-400">· {review.targetId ?? '-'}</span>
    </span>
  );
}

function ReviewBody({ review }: { review: AdminReviewSummary }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <PlaceBadge review={review} />
        <span className="text-xs font-bold text-amber-500">{'★'.repeat(review.rating)}</span>
        <span className="text-xs text-gray-400">{fmtDate(review.createdAt)}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">작성자: {personLabel(review.author)}</p>
      {review.content && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900">{review.content}</p>}
      {review.photoUrls.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {review.photoUrls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${url}-${i}`}
              src={url}
              alt={`리뷰 사진 ${i + 1}`}
              className="h-20 w-20 flex-shrink-0 rounded-lg border border-gray-200 object-cover"
            />
          ))}
        </div>
      )}
    </>
  );
}

function PendingCard({
  item,
  busy,
  onHide,
  onDismiss,
}: {
  item: AdminQueueItem;
  busy: boolean;
  onHide: () => void;
  onDismiss: () => void;
}) {
  const { review, reports } = item;
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <ReviewBody review={review} />

      <div className="mt-3 rounded-lg bg-red-50 p-3">
        <p className="mb-2 text-xs font-bold text-red-700">신고 {reports.length}건</p>
        <ul className="space-y-1.5">
          {reports.map((rep) => (
            <li key={rep.id} className="text-xs text-gray-700">
              <span className="font-bold text-red-600">{REASON_LABEL[rep.reason] ?? rep.reason}</span>
              <span className="mx-1 text-gray-400">·</span>
              신고자 {personLabel(rep.reporter)}
              <span className="mx-1 text-gray-400">·</span>
              <span className="text-gray-400">{fmtDate(rep.createdAt)}</span>
              {rep.detail && <span className="mt-0.5 block text-gray-500">&ldquo;{rep.detail}&rdquo;</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onHide}
          disabled={busy}
          className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? '처리 중…' : '숨김'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
        >
          {busy ? '처리 중…' : '기각'}
        </button>
      </div>
    </li>
  );
}

function HiddenCard({
  review,
  busy,
  onUnhide,
}: {
  review: AdminReviewSummary;
  busy: boolean;
  onUnhide: () => void;
}) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <ReviewBody review={review} />
      <div className="mt-3">
        <button
          type="button"
          onClick={onUnhide}
          disabled={busy}
          className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {busy ? '처리 중…' : '숨김 해제'}
        </button>
      </div>
    </li>
  );
}
