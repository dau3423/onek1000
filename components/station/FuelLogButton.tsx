'use client';

// 주유소 상세 "여기서 주유" 버튼.
// 누르면 인라인 입력 영역(리터/금액 단축칩 + 직접입력 + 현재 키로수)을 펼친다.
// 단축칩은 해당 입력칸(리터/금액)에 값을 채우기만 한다(즉시 저장 안 함, 선택 강조만).
// 리터/금액/키로수를 채운 뒤 단일 "저장" 버튼으로만 저장한다(전부 빈값이면 방문 기록만 저장).
// 비로그인 시 signIn 유도. 단가/유종/시각은 서버가 보강한다(클라는 stationId + 선택값만 전송).
import { useEffect, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import type { FuelLog } from '@/types/fuel-log';
import { amountToQuantity, hasUsableUnitPrice, quantityToAmount, segmentKmPerL } from '@/lib/fuel/calc';

interface Props {
  stationId: string;
  className?: string;
  /** 보조 표시용 휘발유 현재가(원/L). 단축입력 시 리터↔금액 추정에 사용. 없으면 표시 생략. */
  unitPrice?: number | null;
}

type State = 'idle' | 'busy' | 'done';

// 합리적 프리셋 — 리터/금액 단축칩. 누르면 해당 입력칸을 채운다(저장은 단일 버튼에서).
const LITER_PRESETS = [30, 50] as const; // L
const AMOUNT_PRESETS = [30000, 50000, 70000] as const; // 원

export function FuelLogButton({ stationId, className, unitPrice }: Props) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [err, setErr] = useState<string | null>(null);
  // 직접입력 필드(둘 중 입력한 값만 저장에 사용)
  const [liters, setLiters] = useState('');
  const [amount, setAmount] = useState('');
  // 현재 키로수(주행거리계). 마지막 값 프리필 후 뒷자리만 고쳐 저장하는 흐름.
  const [odometer, setOdometer] = useState('');
  // 직전(마지막 저장) 주행거리계 — 프리필·안내·저장 직후 구간 연비 계산의 기준점.
  const [recentOdometer, setRecentOdometer] = useState<number | null>(null);
  // 저장 직후 보여줄 이번 구간 연비(km/L). 무효(거리 0 등)면 null.
  const [lastKmPerL, setLastKmPerL] = useState<number | null>(null);
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
        setRecentOdometer(last.odometer);
        // 최근 1건의 값을 입력 필드에 프리필(칩과 일치하면 칩이 자동 강조됨).
        if (!prefilled.current) {
          prefilled.current = true;
          if (last.amountWon != null) setAmount(String(last.amountWon));
          else if (last.liters != null) setLiters(String(last.liters));
          // 마지막 키로수를 그대로 채워 둔다(뒷자리만 수정해 저장 → 입력 최소화).
          if (last.odometer != null) setOdometer(String(last.odometer));
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
  // 현재 키로수 입력값은 함께 합쳐 보낸다(빈값이면 미전송).
  const save = async (payload: { liters?: number; amountWon?: number }) => {
    if (status !== 'authenticated') {
      signIn(undefined, { callbackUrl: `/station/${encodeURIComponent(stationId)}` });
      return;
    }
    // 현재 키로수: 빈값이면 미전송, 음수/NaN이면 에러 안내(프리필값 그대로 저장은 허용).
    let odo: number | undefined;
    if (odometer.trim() !== '') {
      const o = Number(odometer);
      if (!Number.isFinite(o) || o < 0) {
        setErr('현재 키로수는 0 이상 숫자로 입력해 주세요.');
        return;
      }
      odo = Math.round(o);
    }
    setState('busy');
    setErr(null);
    try {
      const res = await fetch('/api/fuel-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, ...payload, ...(odo != null ? { odometer: odo } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? '저장에 실패했어요.');
      // 이번 구간 연비: 직전 키로수(프리필 소스) → 이번 키로수 / 이번 주유량. 무효면 null.
      //   buildEconomy와 동일한 segmentKmPerL 규칙(거리>0·L>0·1~100 km/L) 적용.
      const kmPerL = segmentKmPerL(recentOdometer, odo ?? null, payload.liters ?? null);
      setLastKmPerL(kmPerL);
      // 방금 저장한 키로수를 기준점으로 갱신(다음 주유 때 구간 연비 계산·프리필). 값 없는 저장은 유지.
      if (odo != null) setRecentOdometer(odo);
      setState('done');
      setOpen(false);
      setLiters('');
      setAmount('');
      // 키로수는 비우지 않고 방금 저장한 값을 유지(다음 주유 때 뒷자리만 수정).
      if (odo != null) setOdometer(String(odo));
      window.setTimeout(() => setState('idle'), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState('idle');
    }
  };

  // 단일 저장 핸들러: 입력된 값만 전송(둘 다 비어도 방문 기록으로 저장). 키로수는 save에서 합침.
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
  // 칩 강조: 현재 입력 필드 값과 칩 값이 일치하면 선택 표시(칩은 입력칸을 채우는 동작).
  const chipActive = 'border-primary bg-primary/10 text-primary';
  const literActive = (l: number) => liters.trim() !== '' && Number(liters) === l;
  const amountActive = (a: number) => amount.trim() !== '' && Number(amount) === a;
  const literChipCls = (l: number) => (literActive(l) ? `${chip} ${chipActive}` : chip);
  const amountChipCls = (a: number) => (amountActive(a) ? `${chip} ${chipActive}` : chip);

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
        {state === 'busy'
          ? '저장 중…'
          : state === 'done'
            ? lastKmPerL != null
              ? `✓ 주유 기록 저장됨 · 이번 연비 ${lastKmPerL} km/L`
              : '✓ 주유 기록 저장됨'
            : '⛽ 여기서 주유'}
      </button>

      {open && state !== 'done' && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-800">
          <p className="text-xs font-semibold text-gray-700">주유량(L)</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {LITER_PRESETS.map((l) => (
              <button
                key={l}
                className={literChipCls(l)}
                aria-pressed={literActive(l)}
                disabled={state === 'busy'}
                onClick={() => setLiters(String(l))}
              >
                {l}L
              </button>
            ))}
            <button
              className={liters.trim() === '' ? `${chip} ${chipActive}` : chip}
              aria-pressed={liters.trim() === ''}
              disabled={state === 'busy'}
              onClick={() => setLiters('')}
              title="가득(주유량 미지정 — 나중에 입력)"
            >
              가득
            </button>
          </div>

          <p className="mt-3 text-xs font-semibold text-gray-700">금액(원)</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {AMOUNT_PRESETS.map((a) => (
              <button
                key={a}
                className={amountChipCls(a)}
                aria-pressed={amountActive(a)}
                disabled={state === 'busy'}
                onClick={() => setAmount(String(a))}
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

          <p className="mt-3 text-xs font-semibold text-gray-700">현재 키로수(km)</p>
          <div className="mt-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder="예: 50120"
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
            />
            {recentOdometer != null && (
              <p className="mt-1 text-[11px] text-gray-500">
                지난번 {recentOdometer.toLocaleString()}km · 입력하면 연비가 계산돼요.
              </p>
            )}
          </div>

          <div className="mt-3">
            <button
              onClick={saveManual}
              disabled={state === 'busy'}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60"
              title="입력값(빈값은 방문 기록)으로 저장"
            >
              저장
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
