'use client';

// 내 기록 목록(주유 + 전기차 충전 통합) + 간단 통계 + 개별 편집/삭제.
// 1클릭 저장은 주유소/충전소 상세에서 하고, 여기서는 금액/주유량(L)·충전량(kWh)/주행거리/메모를 나중에 편집한다.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PRODUCT_LABEL } from '@/types/station';
import type { FuelLog, FuelLogStation } from '@/types/fuel-log';
import { amountToQuantity, hasUsableUnitPrice, quantityToAmount } from '@/lib/fuel/calc';
import { MyStationsMap } from '@/components/fuel/MyStationsMap';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

interface Stats {
  count: number;
  totalSpent: number;
  /** 주유 기록 평균 단가(원/L). EV는 단위(원/kWh)가 달라 혼합하지 않는다. */
  avgUnitPrice: number | null;
}

function computeStats(logs: FuelLog[]): Stats {
  const totalSpent = logs.reduce((s, l) => s + (l.amountWon ?? 0), 0);
  // 평균 단가는 단위가 같은 주유(원/L) 기록만 집계(EV 원/kWh와 혼합 금지).
  const priced = logs.filter((l) => l.kind === 'gas' && l.unitPrice != null);
  const avgUnitPrice =
    priced.length > 0 ? Math.round(priced.reduce((s, l) => s + (l.unitPrice ?? 0), 0) / priced.length) : null;
  return { count: logs.length, totalSpent, avgUnitPrice };
}

type Tab = 'list' | 'map';

export function FuelLogManager() {
  const [tab, setTab] = useState<Tab>('list');
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
        <p className="text-sm text-gray-500">아직 기록이 없어요.</p>
        <p className="text-xs leading-relaxed text-gray-400">
          주유소·충전소 상세에서 “여기서 주유 / 여기서 충전” 버튼 한 번으로 기록할 수 있어요.
        </p>
        <Link href="/" className="mt-1 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
          지도에서 찾기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 목록 / 지도 전환 토글 */}
      <div className="flex rounded-xl bg-gray-100 p-1">
        <TabButton active={tab === 'list'} onClick={() => setTab('list')} label="목록" />
        <TabButton active={tab === 'map'} onClick={() => setTab('map')} label="지도" />
      </div>

      {tab === 'list' ? (
        <ListTab
          logs={logs}
          editing={editing}
          setEditing={setEditing}
          onSaved={onSaved}
          remove={remove}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMore={loadMore}
        />
      ) : (
        <MapTab />
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );
}

// 지도 탭 — 내가 주유한 주유소만 핀으로(방문 횟수 배지). 탭 진입 시 1회 조회.
function MapTab() {
  const [stations, setStations] = useState<FuelLogStation[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/fuel-logs/stations')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setStations((d.stations ?? []) as FuelLogStation[]);
      })
      .catch(() => {
        if (alive) setStations([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (stations === null) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-sm text-gray-400">
        불러오는 중…
      </div>
    );
  }

  if (stations.length === 0) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50 text-center">
        <div className="text-4xl">🗺️</div>
        <p className="text-sm text-gray-500">아직 주유 기록이 없어요.</p>
        <p className="text-xs text-gray-400">좌표가 있는 주유소 기록이 생기면 지도에 표시돼요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <MyStationsMap stations={stations} />
      <p className="text-center text-[11px] text-gray-400">
        핀의 숫자는 방문 횟수예요. 핀을 누르면 주유소 상세로 이동해요.
      </p>
    </div>
  );
}

// 목록 탭 — 기존 통계 + 리스트(편집/삭제/더보기).
function ListTab({
  logs,
  editing,
  setEditing,
  onSaved,
  remove,
  hasMore,
  loadingMore,
  loadMore,
}: {
  logs: FuelLog[];
  editing: string | null;
  setEditing: (id: string | null) => void;
  onSaved: (l: FuelLog) => void;
  remove: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}) {
  const router = useRouter();
  const stats = computeStats(logs);

  // 기록 항목 탭 → 해당 주유소/충전소 상세로 이동(EV는 /ev/{statId}, 주유는 /station/{id}).
  // 편집/삭제 영역과 충돌하지 않게 정보 영역에만 핸들러를 둔다(영역 분리).
  const goDetail = (l: FuelLog) => {
    const path = l.kind === 'ev' ? `/ev/${encodeURIComponent(l.stationId)}` : `/station/${encodeURIComponent(l.stationId)}`;
    router.push(path);
  };

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
                <button
                  type="button"
                  onClick={() => goDetail(l)}
                  aria-label={`${l.stationName} 상세 보기`}
                  className="group -m-1 min-w-0 flex-1 rounded-lg p-1 text-left transition hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-gray-900">{l.stationName}</span>
                    {l.kind === 'ev' ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        ⚡ 충전
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                        ⛽ {PRODUCT_LABEL[l.product]}
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-400"
                    >
                      ›
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {formatDate(l.loggedAt)}
                    {l.kind === 'ev' ? (
                      <>
                        {l.unitPrice != null && <> · ₩{l.unitPrice.toLocaleString()}/kWh</>}
                        {l.amountWon != null && <> · 총 ₩{l.amountWon.toLocaleString()}</>}
                        {l.kwh != null && <> · {l.kwh}kWh</>}
                        {l.odometer != null && <> · {l.odometer.toLocaleString()}km</>}
                      </>
                    ) : (
                      <>
                        {l.unitPrice != null && <> · ₩{l.unitPrice.toLocaleString()}/L</>}
                        {l.amountWon != null && <> · 총 ₩{l.amountWon.toLocaleString()}</>}
                        {l.liters != null && <> · {l.liters}L</>}
                        {l.odometer != null && <> · {l.odometer.toLocaleString()}km</>}
                      </>
                    )}
                  </span>
                  {l.memo && <span className="mt-1 block text-xs text-gray-600">{l.memo}</span>}
                </button>
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
  const isEv = log.kind === 'ev';
  const [amountWon, setAmountWon] = useState(log.amountWon != null ? String(log.amountWon) : '');
  const [liters, setLiters] = useState(log.liters != null ? String(log.liters) : '');
  const [kwh, setKwh] = useState(log.kwh != null ? String(log.kwh) : '');
  const [odometer, setOdometer] = useState(log.odometer != null ? String(log.odometer) : '');
  const [memo, setMemo] = useState(log.memo ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 단가 기반 자동계산: gas=리터↔금액, ev=충전량↔금액. unit_price가 유효(양수)할 때만 동작.
  // 무한루프 방지: onChange 핸들러 안에서만 반대쪽을 갱신(useEffect 양방향 의존 회피).
  // 사용자가 자동계산된 값을 직접 수정하면 그 쪽이 입력 소스가 되어 반대쪽이 파생됨(덮어쓰기 허용).
  const autoCalc = hasUsableUnitPrice(log.unitPrice);
  const setQuantity = isEv ? setKwh : setLiters;

  // 수량(L/kWh) 입력 → 금액 파생.
  const onQuantityChange = (v: string) => {
    setQuantity(v);
    if (!autoCalc) return;
    if (v.trim() === '') {
      setAmountWon('');
      return;
    }
    const n = Number(v);
    const amount = quantityToAmount(n, log.unitPrice);
    if (amount != null) setAmountWon(String(amount));
  };

  // 금액 입력 → 수량 파생.
  const onAmountChange = (v: string) => {
    setAmountWon(v);
    if (!autoCalc) return;
    if (v.trim() === '') {
      setQuantity('');
      return;
    }
    const n = Number(v);
    const qty = amountToQuantity(n, log.unitPrice);
    if (qty != null) setQuantity(String(qty));
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      // 종류에 맞는 수치만 전송(주유=liters, 충전=kwh).
      const quantity = isEv
        ? { kwh: kwh === '' ? null : Number(kwh) }
        : { liters: liters === '' ? null : Number(liters) };
      const res = await fetch(`/api/fuel-logs/${encodeURIComponent(log.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountWon: amountWon === '' ? null : Number(amountWon),
          ...quantity,
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
        <Field label="금액(원)" value={amountWon} onChange={onAmountChange} inputMode="numeric" />
        {isEv ? (
          <Field label="충전량(kWh)" value={kwh} onChange={onQuantityChange} inputMode="decimal" />
        ) : (
          <Field label="주유량(L)" value={liters} onChange={onQuantityChange} inputMode="decimal" />
        )}
        <Field label="주행거리(km)" value={odometer} onChange={setOdometer} inputMode="numeric" />
      </div>
      {autoCalc && (
        <p className="text-[11px] text-gray-400">
          단가 ₩{log.unitPrice!.toLocaleString()}/{isEv ? 'kWh' : 'L'} 기준 {isEv ? '충전량' : '주유량'}·금액이 자동
          계산돼요. 직접 수정하면 그 값이 우선해요.
        </p>
      )}
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
