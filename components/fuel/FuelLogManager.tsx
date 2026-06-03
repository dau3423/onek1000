'use client';

// 내 주유 기록 목록 + 간단 통계 + 개별 편집/삭제.
// 1클릭 저장은 주유소 상세에서 하고, 여기서는 금액/주유량(L)/주행거리/메모를 나중에 편집한다.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PRODUCT_LABEL } from '@/types/station';
import type { FuelLog } from '@/types/fuel-log';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

interface Stats {
  count: number;
  totalSpent: number;
  avgUnitPrice: number | null;
}

function computeStats(logs: FuelLog[]): Stats {
  const totalSpent = logs.reduce((s, l) => s + (l.amountWon ?? 0), 0);
  const priced = logs.filter((l) => l.unitPrice != null);
  const avgUnitPrice =
    priced.length > 0 ? Math.round(priced.reduce((s, l) => s + (l.unitPrice ?? 0), 0) / priced.length) : null;
  return { count: logs.length, totalSpent, avgUnitPrice };
}

export function FuelLogManager() {
  const [logs, setLogs] = useState<FuelLog[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/fuel-logs')
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? []);
        setHasMore(Boolean(d.hasMore));
      })
      .catch(() => setLogs([]));
  }, []);

  const loadMore = async () => {
    const next = page + 1;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/fuel-logs?page=${next}`);
      const d = await res.json();
      setLogs((prev) => [...(prev ?? []), ...((d.logs ?? []) as FuelLog[])]);
      setHasMore(Boolean(d.hasMore));
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  };

  const onSaved = (updated: FuelLog) => {
    setLogs((prev) => (prev ?? []).map((l) => (l.id === updated.id ? updated : l)));
    setEditing(null);
  };

  const remove = async (id: string) => {
    setLogs((prev) => (prev ?? []).filter((l) => l.id !== id));
    await fetch(`/api/fuel-logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  };

  if (logs === null) {
    return <p className="text-sm text-gray-400">불러오는 중…</p>;
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="text-5xl">⛽</div>
        <p className="text-sm text-gray-500">아직 주유 기록이 없어요.</p>
        <p className="text-xs leading-relaxed text-gray-400">
          주유소 상세에서 “여기서 주유” 버튼 한 번으로 기록할 수 있어요.
        </p>
        <Link href="/" className="mt-1 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
          지도에서 찾기
        </Link>
      </div>
    );
  }

  const stats = computeStats(logs);

  return (
    <div className="space-y-5">
      {/* 간단 통계 (현재 로드된 기록 기준) */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="기록 수" value={`${stats.count}건`} />
        <StatCard label="총 주유비" value={stats.totalSpent > 0 ? `₩${stats.totalSpent.toLocaleString()}` : '-'} />
        <StatCard label="평균 단가" value={stats.avgUnitPrice != null ? `₩${stats.avgUnitPrice.toLocaleString()}` : '-'} />
      </div>

      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
        {logs.map((l) =>
          editing === l.id ? (
            <li key={l.id} className="px-4 py-3">
              <EditForm log={l} onSaved={onSaved} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={l.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-gray-900">{l.stationName}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                      {PRODUCT_LABEL[l.product]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {formatDate(l.loggedAt)}
                    {l.unitPrice != null && <> · ₩{l.unitPrice.toLocaleString()}/L</>}
                    {l.amountWon != null && <> · 총 ₩{l.amountWon.toLocaleString()}</>}
                    {l.liters != null && <> · {l.liters}L</>}
                    {l.odometer != null && <> · {l.odometer.toLocaleString()}km</>}
                  </div>
                  {l.memo && <div className="mt-1 text-xs text-gray-600">{l.memo}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    onClick={() => setEditing(l.id)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                  >
                    편집
                  </button>
                  <button
                    onClick={() => remove(l.id)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </li>
          ),
        )}
      </ul>

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {loadingMore ? '불러오는 중…' : '더 보기'}
        </button>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-gray-900">{value}</div>
    </div>
  );
}

function EditForm({
  log,
  onSaved,
  onCancel,
}: {
  log: FuelLog;
  onSaved: (l: FuelLog) => void;
  onCancel: () => void;
}) {
  const [amountWon, setAmountWon] = useState(log.amountWon != null ? String(log.amountWon) : '');
  const [liters, setLiters] = useState(log.liters != null ? String(log.liters) : '');
  const [odometer, setOdometer] = useState(log.odometer != null ? String(log.odometer) : '');
  const [memo, setMemo] = useState(log.memo ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/fuel-logs/${encodeURIComponent(log.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountWon: amountWon === '' ? null : Number(amountWon),
          liters: liters === '' ? null : Number(liters),
          odometer: odometer === '' ? null : Number(odometer),
          memo: memo.trim() === '' ? null : memo.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? '수정에 실패했어요.');
      onSaved(d.log as FuelLog);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="text-sm font-semibold text-gray-900">{log.stationName}</div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="금액(원)" value={amountWon} onChange={setAmountWon} inputMode="numeric" />
        <Field label="주유량(L)" value={liters} onChange={setLiters} inputMode="decimal" />
        <Field label="주행거리(km)" value={odometer} onChange={setOdometer} inputMode="numeric" />
      </div>
      <input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        maxLength={200}
        placeholder="메모 (선택)"
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
      />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode: 'numeric' | 'decimal';
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-primary"
      />
    </label>
  );
}
