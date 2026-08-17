'use client';

// 전기차 충전소 상세 "여기서 충전" 버튼. (FuelLogButton 미러링)
// 누르면 인라인 입력 영역(kWh/금액 단축칩 + 직접입력)을 펼친다.
// 단축칩을 누르면 그 값과 함께 즉시 저장, 직접입력 후 "저장"도 가능. 값 없이 "그냥 저장"도 유지.
// 비로그인 시 signIn 유도. 충전소/시각은 서버가 보강한다(클라는 statId + 선택값만 전송).
import { useEffect, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import type { FuelLog } from '@/types/fuel-log';
import { CheckIcon, BoltIcon } from '@/components/icons';

interface Props {
  statId: string;
  className?: string;
}

type State = 'idle' | 'busy' | 'done';

// 합리적 프리셋 — kWh/금액 단축칩.
const KWH_PRESETS = [10, 30, 50] as const; // kWh
const AMOUNT_PRESETS = [10000, 20000, 30000] as const; // 원

export function EvChargeLogButton({ statId, className }: Props) {
  const t = useTranslations('ev');
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [kwh, setKwh] = useState('');
  const [amount, setAmount] = useState('');
  // 최근 기록 기반 기본값(가장 최근 ev 1건). 단축칩에 있으면 칩 강조, 없으면 직접입력에 프리필.
  const [recentKwh, setRecentKwh] = useState<number | null>(null);
  const [recentAmount, setRecentAmount] = useState<number | null>(null);
  const prefilled = useRef(false); // 사용자가 만지기 전 1회만 프리필

  // 마운트 시 1회: 가장 최근 ev 기록을 가벼운 limit=1로 조회해 기본값 준비.
  // 비로그인 시 조회하지 않음. 기록 없으면 빈 상태 유지.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch('/api/fuel-logs?kind=ev&limit=1');
        if (!res.ok) return;
        const d = (await res.json()) as { logs?: FuelLog[] };
        const last = d.logs?.[0];
        if (!alive || !last) return;
        setRecentKwh(last.kwh);
        setRecentAmount(last.amountWon);
        if (!prefilled.current) {
          prefilled.current = true;
          if (last.amountWon != null && !(AMOUNT_PRESETS as readonly number[]).includes(last.amountWon)) {
            setAmount(String(last.amountWon));
          } else if (last.kwh != null && !(KWH_PRESETS as readonly number[]).includes(last.kwh)) {
            setKwh(String(last.kwh));
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

  const save = async (payload: { kwh?: number; amountWon?: number }) => {
    if (status !== 'authenticated') {
      signIn(undefined, { callbackUrl: `/ev/${encodeURIComponent(statId)}` });
      return;
    }
    setState('busy');
    setErr(null);
    try {
      const res = await fetch('/api/fuel-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: statId, kind: 'ev', ...payload }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('saveFailed'));
      // 방금 저장한 값으로 최근값 갱신(다음에 열 때도 같은 칩이 강조되도록).
      if (payload.kwh != null) setRecentKwh(payload.kwh);
      if (payload.amountWon != null) setRecentAmount(payload.amountWon);
      setState('done');
      setOpen(false);
      setKwh('');
      setAmount('');
      window.setTimeout(() => setState('idle'), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState('idle');
    }
  };

  const saveManual = () => {
    const k = kwh.trim() === '' ? undefined : Number(kwh);
    const a = amount.trim() === '' ? undefined : Number(amount);
    if (k !== undefined && (!Number.isFinite(k) || k < 0)) {
      setErr(t('invalidKwh'));
      return;
    }
    if (a !== undefined && (!Number.isFinite(a) || a < 0)) {
      setErr(t('invalidAmount'));
      return;
    }
    void save({ kwh: k, amountWon: a });
  };

  const onMainClick = () => {
    if (status !== 'authenticated') {
      signIn(undefined, { callbackUrl: `/ev/${encodeURIComponent(statId)}` });
      return;
    }
    setErr(null);
    setOpen((v) => !v);
  };

  const chip =
    'rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-60';
  // 최근 기록과 일치하는 칩 강조(이전에 고른 값을 미리 선택해 보이게).
  const chipActive = 'border-emerald-600 bg-emerald-600/10 text-emerald-700';
  const kwhChipCls = (k: number) => (recentKwh === k ? `${chip} ${chipActive}` : chip);
  const amountChipCls = (a: number) => (recentAmount === a ? `${chip} ${chipActive}` : chip);

  return (
    <div>
      <button
        onClick={onMainClick}
        disabled={state === 'busy'}
        aria-expanded={open}
        className={
          className ??
          'block w-full rounded-xl bg-emerald-600 py-3.5 text-center font-bold text-white disabled:opacity-60'
        }
      >
        {state === 'busy' ? (
          t('saving')
        ) : state === 'done' ? (
          <span className="inline-flex items-center justify-center gap-1.5">
            <CheckIcon className="h-4 w-4" />
            {t('savedLog')}
          </span>
        ) : (
          <span className="inline-flex items-center justify-center gap-1.5">
            <BoltIcon className="h-4 w-4" />
            {t('chargeHere')}
          </span>
        )}
      </button>

      {open && state !== 'done' && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-800">
          <p className="text-xs font-semibold text-gray-700">{t('kwhLabel')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {KWH_PRESETS.map((k) => (
              <button
                key={k}
                className={kwhChipCls(k)}
                aria-pressed={recentKwh === k}
                disabled={state === 'busy'}
                onClick={() => void save({ kwh: k })}
              >
                {k}kWh
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs font-semibold text-gray-700">{t('amountLabel')}</p>
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

          <p className="mt-3 text-xs font-semibold text-gray-700">{t('manualInput')}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <label className="flex-1">
              <span className="sr-only">{t('kwhLabel')}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={kwh}
                onChange={(e) => setKwh(e.target.value)}
                placeholder={t('kwhLabel')}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none"
              />
            </label>
            <label className="flex-1">
              <span className="sr-only">{t('amountLabel')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('amountLabel')}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={saveManual}
              disabled={state === 'busy'}
              className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {t('saveManual')}
            </button>
            <button
              onClick={() => void save({})}
              disabled={state === 'busy'}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-60"
              title={t('saveVisitOnlyTitle')}
            >
              {t('saveVisitOnly')}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500">{t('editHint')}</p>
        </div>
      )}

      {state === 'done' && (
        <p className="mt-1.5 text-center text-xs text-gray-500">
          {t('editHintDone')}
        </p>
      )}
      {err && <p className="mt-1.5 text-center text-xs text-red-500">{err}</p>}
    </div>
  );
}
