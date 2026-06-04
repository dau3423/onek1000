'use client';

// 주유소 상세 "여기서 주유" 버튼.
// 누르면 인라인 입력 영역(리터/금액 단축칩 + 직접입력)을 펼친다.
// 단축칩을 누르면 그 값과 함께 즉시 저장, 직접입력 후 "저장"도 가능. 값 없이 "그냥 저장"도 유지.
// 비로그인 시 signIn 유도. 단가/유종/시각은 서버가 보강한다(클라는 stationId + 선택값만 전송).
import { useEffect, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import type { FuelLog } from '@/types/fuel-log';
import { amountToQuantity, hasUsableUnitPrice, quantityToAmount } from '@/lib/fuel/calc';

interface Props {
  stationId: string;
  className?: string;
  /** 보조 표시용 휘발유 현재가(원/L). 단축입력 시 리터↔금액 추정에 사용. 없으면 표시 생략. */
  unitPrice?: number | null;
}

type State = 'idle' | 'busy' | 'done';

// 합리적 프리셋 — 리터/금액 단축칩.
const LITER_PRESETS = [30, 50] as const; // L (가득은 직접입력)
const AMOUNT_PRESETS = [30000, 50000, 70000] as const; // 원

export function FuelLogButton({ stationId, className, unitPrice }: Props) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [err, setErr] = useState<string | null>(null);
  // 직접입력 필드(둘 중 입력한 값만 저장에 사용)
  const [liters, setLiters] = useState('');
  const [amount, setAmount] = useState('');
  // 최근 기록 기반 기본값(가장 최근 gas 1건). 단축칩에 있으면 칩 선택 강조, 없으면 직접입력에 프리필.
  const [recentLiters, setRecentLiters] = useState<number | null>(null);
  const [recentAmount, setRecentAmount] = useState<number | null>(null);
  const prefilled = useRef(false); // 사용자가 만지기 전 1회만 프리필

  // 마운트 시 1회: 가장 최근 gas 기록을 가벼운 limit=1로 조회해 기본값 준비.
  // 비로그인 시 조회하지 않음(401 회피). 기록 없으면 빈 상태 유지.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch('/api/fuel-logs?kind=gas&limit=1');
        if (!res.ok) return;
        const d = (await res.json()) as { logs?: FuelLog[] };
        const last = d.logs?.[0];
        if (!alive || !last) return;
        setRecentLiters(last.liters);
        setRecentAmount(last.amountWon);
        // 단축칩에 없는 값이면 직접입력 필드에 프리필(칩에 있으면 칩 강조로 표현).
        if (!prefilled.current) {
          prefilled.current = true;
          if (last.amountWon != null && !(AMOUNT_PRESETS as readonly number[]).includes(last.amountWon)) {
            setAmount(String(last.amountWon));
          } else if (last.liters != null && !(LITER_PRESETS as readonly number[]).includes(last.liters)) {
            setLiters(String(last.liters));
          }
        }
      } catch {
        /* 프리필은 베스트에포트 — 실패해도 무시 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [status]);

  // 저장: payload에 liters/amountWon 포함(빈값은 미포함 → 서버는 null 처리).
  const save = async (payload: { liters?: number; amountWon?: number }) => {
    if (status !== 'authenticated') {
      signIn(undefined, { callbackUrl: `/station/${encodeURIComponent(stationId)}` });
      return;
    }
    setState('busy');
    setErr(null);
    try {
      const res = await fetch('/api/fuel-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, ...payload }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? '저장에 실패했어요.');
      // 방금 저장한 값으로 최근값 갱신(다음에 열 때도 같은 칩이 강조되도록). 값 없는 저장은 유지.
      if (payload.liters != null) setRecentLiters(payload.liters);
      if (payload.amountWon != null) setRecentAmount(payload.amountWon);
      setState('done');
      setOpen(false);
      setLiters('');
      setAmount('');
      window.setTimeout(() => setState('idle'), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState('idle');
    }
  };

  // 직접입력 저장(둘 중 입력된 값만 전송, 둘 다 입력 시 둘 다 전송).
  const saveManual = () => {
    const l = liters.trim() === '' ? undefined : Number(liters);
    const a = amount.trim() === '' ? undefined : Number(amount);
    if (l !== undefined && (!Number.isFinite(l) || l < 0)) {
      setErr('주유량은 0 이상 숫자로 입력해 주세요.');
      return;
    }
    if (a !== undefined && (!Number.isFinite(a) || a < 0)) {
      setErr('금액은 0 이상 숫자로 입력해 주세요.');
      return;
    }
    void save({ liters: l, amountWon: a });
  };

  const onMainClick = () => {
    if (status !== 'authenticated') {
      signIn(undefined, { callbackUrl: `/station/${encodeURIComponent(stationId)}` });
      return;
    }
    setErr(null);
    setOpen((v) => !v);
  };

  const chip =
    'rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:border-primary hover:text-primary disabled:opacity-60';
  // 최근 기록과 일치하는 칩 강조(이전에 고른 값을 미리 선택해 보이게).
  const chipActive = 'border-primary bg-primary/10 text-primary';
  const literChipCls = (l: number) => (recentLiters === l ? `${chip} ${chipActive}` : chip);
  const amountChipCls = (a: number) => (recentAmount === a ? `${chip} ${chipActive}` : chip);

  // 단축입력 보조 표시: 현재가(휘발유)를 알면 입력값으로 반대편을 추정해 안내(저장값은 입력 그대로).
  const canEstimate = hasUsableUnitPrice(unitPrice);
  const litersNum = liters.trim() === '' ? null : Number(liters);
  const amountNum = amount.trim() === '' ? null : Number(amount);
  const estAmount =
    canEstimate && litersNum != null && Number.isFinite(litersNum)
      ? quantityToAmount(litersNum, unitPrice)
      : null;
  const estLiters =
    canEstimate && amountNum != null && Number.isFinite(amountNum)
      ? amountToQuantity(amountNum, unitPrice)
      : null;

  return (
    <div>
      <button
        onClick={onMainClick}
        disabled={state === 'busy'}
        aria-expanded={open}
        className={
          className ??
          'block w-full rounded-xl bg-primary py-3.5 text-center font-bold text-white disabled:opacity-60'
        }
      >
        {state === 'busy' ? '저장 중…' : state === 'done' ? '✓ 주유 기록 저장됨' : '⛽ 여기서 주유'}
      </button>

      {open && state !== 'done' && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-800">
          <p className="text-xs font-semibold text-gray-700">주유량(L)</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {LITER_PRESETS.map((l) => (
              <button
                key={l}
                className={literChipCls(l)}
                aria-pressed={recentLiters === l}
                disabled={state === 'busy'}
                onClick={() => void save({ liters: l })}
              >
                {l}L
              </button>
            ))}
            <button className={chip} disabled={state === 'busy'} onClick={() => void save({})} title="가득 주유(주유량은 나중에 입력)">
              가득
            </button>
          </div>

          <p className="mt-3 text-xs font-semibold text-gray-700">금액(원)</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {AMOUNT_PRESETS.map((a) => (
              <button
                key={a}
                className={amountChipCls(a)}
                aria-pressed={recentAmount === a}
                disabled={state === 'busy'}
                onClick={() => void save({ amountWon: a })}
              >
                ₩{a.toLocaleString()}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs font-semibold text-gray-700">직접 입력</p>
          <div className="mt-1.5 flex items-center gap-2">
            <label className="flex-1">
              <span className="sr-only">주유량(L)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
                placeholder="리터(L)"
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex-1">
              <span className="sr-only">금액(원)</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="금액(원)"
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={saveManual}
              disabled={state === 'busy'}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              입력값으로 저장
            </button>
            <button
              onClick={() => void save({})}
              disabled={state === 'busy'}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-60"
              title="금액·주유량 없이 방문 기록만 저장"
            >
              그냥 저장
            </button>
          </div>
          {canEstimate && estAmount != null && (
            <p className="mt-1.5 text-[11px] text-gray-500">
              약 ₩{estAmount.toLocaleString()} (휘발유 단가 ₩{unitPrice!.toLocaleString()}/L 기준)
            </p>
          )}
          {canEstimate && estLiters != null && (
            <p className="mt-1.5 text-[11px] text-gray-500">
              약 {estLiters}L (휘발유 단가 ₩{unitPrice!.toLocaleString()}/L 기준)
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-gray-500">단가는 현재가로 자동 입력돼요. 값은 나중에 편집할 수 있어요.</p>
        </div>
      )}

      {state === 'done' && (
        <p className="mt-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
          마이페이지 &gt; 주유 기록에서 금액·주유량을 편집할 수 있어요.
        </p>
      )}
      {err && <p className="mt-1.5 text-center text-xs text-red-500">{err}</p>}
    </div>
  );
}
