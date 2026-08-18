'use client';

// 리뷰 신고 버튼 + 사유 선택 모달.
// 신고 접수 즉시 그 리뷰는 신고자 본인 목록에서 사라진다(서버가 다음 조회부터 필터링).
// 안내 없이 사라지면 "내가 삭제했나?" 오해가 생기므로, 성공 시 반드시 done 안내를 띄운 뒤
// 부모(onReported)에게 알려 목록을 갱신시킨다.

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { REPORT_REASONS, REPORT_DETAIL_MAX, type ReportReason } from '@/types/review';

interface Props {
  reviewId: string;
  onReported: (id: string) => void;
}

// 사유 코드 → 라벨 메시지 키. 절대 번역된 라벨 문자열 자체를 값/식별자로 쓰지 않는다 — 코드로만 분기.
const REASON_LABEL_KEY: Record<ReportReason, string> = {
  spam: 'reasonSpam',
  abuse: 'reasonAbuse',
  irrelevant: 'reasonIrrelevant',
  false_info: 'reasonFalseInfo',
  other: 'reasonOther',
};

export function ReportButton({ reviewId, onReported }: Props) {
  const t = useTranslations('review.report');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setReason(null);
    setDetail('');
    setDone(false);
    setError(null);
  };

  // ESC로 닫기 — 제출 중에는 무시.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, detail: detail.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDone(true); // "신고했습니다. 이 리뷰는 회원님께 더 이상 표시되지 않습니다"
      onReported(reviewId); // 부모가 목록에서 제거
    } catch {
      setError(t('failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('ariaLabel')}
        className="shrink-0 text-[11px] text-gray-400 hover:text-gray-600 hover:underline"
      >
        {t('action')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
          role="dialog"
          aria-modal="true"
          aria-label={t('title')}
          onClick={close}
        >
          <div
            className="w-full max-w-[360px] rounded-2xl bg-white p-4 shadow-2xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <>
                <p className="py-4 text-center text-sm text-gray-700 dark:text-gray-200">{t('done')}</p>
                <button
                  onClick={close}
                  className="w-full rounded-lg bg-gray-100 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  {tCommon('close')}
                </button>
              </>
            ) : (
              <>
                <h2 className="mb-3 text-sm font-bold text-gray-900 dark:text-gray-100">{t('title')}</h2>
                <div className="space-y-2">
                  {REPORT_REASONS.map((code) => (
                    <label
                      key={code}
                      className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                    >
                      <input
                        type="radio"
                        name={`report-reason-${reviewId}`}
                        value={code}
                        checked={reason === code}
                        onChange={() => setReason(code)}
                        className="h-4 w-4 accent-primary"
                      />
                      {t(REASON_LABEL_KEY[code])}
                    </label>
                  ))}
                </div>
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value.slice(0, REPORT_DETAIL_MAX))}
                  placeholder={t('detailPlaceholder')}
                  rows={3}
                  className="mt-3 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white dark:border-gray-700 dark:bg-gray-800"
                />
                {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={close}
                    disabled={busy}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-800"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={submit}
                    disabled={busy || !reason}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
                  >
                    {t('submit')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
