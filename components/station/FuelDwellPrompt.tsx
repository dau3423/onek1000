'use client';

// 주유소 체류 감지 후 표시하는 확인 팝업.
// "방금 {주유소명}에서 주유하셨나요?" + 리터/금액 단축칩 + 직접입력 + [확인=저장] / [아니오=닫기].
// FuelLogButton의 단축칩/프리필/저장 로직을 모달 형태로 재사용한다(단가/유종/시각은 서버 보강).
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FuelLog } from '@/types/fuel-log';
import { amountToQuantity, hasUsableUnitPrice, quantityToAmount } from '@/lib/fuel/calc';
import { CloseIcon, FuelIcon } from '@/components/icons';

// FuelLogButton과 동일 프리셋(일관성).
const LITER_PRESETS = [30, 50] as const; // L (가득은 직접입력)
const AMOUNT_PRESETS = [30000, 50000, 70000] as const; // 원

type State = 'idle' | 'busy';

interface Props {
  stationId: string;
  stationName: string;
  /** 보조 표시용 현재가(원/L). 단축입력 시 리터↔금액 추정에 사용. 없으면 표시 생략. */
  unitPrice?: number | null;
  /** 저장 완료/닫기 → 팝업 해제 */
  onClose: () => void;
  /** 저장 성공 시 부모에게 알림(피드백 토스트 등). 선택 */
  onSaved?: () => void;
}

export function FuelDwellPrompt({ stationId, stationName, unitPrice, onClose, onSaved }: Props) {
  const t = useTranslations('station.fuelLog');
  const tCommon = useTranslations('common');
  const [state, setState] = useState<State>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [liters, setLiters] = useState('');
  const [amount, setAmount] = useState('');
  // 최근 gas 기록 기반 단축칩 강조/프리필(FuelLogButton과 동일 정책).
  const [recentLiters, setRecentLiters] = useState<number | null>(null);
  const [recentAmount, setRecentAmount] = useState<number | null>(null);
  const prefilled = useRef(false);

  // 마운트 시 1회: 최근 gas 1건으로 기본값 준비(로그인 전제 — 비로그인은 애초에 팝업이 안 뜸).
  useEffect(() => {
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
  }, []);

  // 저장: stationId + 선택값만 전송(단가/유종/시각은 서버 보강).
  const save = async (payload: { liters?: number; amountWon?: number }) => {
    setState('busy');
    setErr(null);
    try {
      const res = await fetch('/api/fuel-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, ...payload }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('saveFailed'));
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState('idle');
    }
  };

  const saveManual = () => {
    const l = liters.trim() === '' ? undefined : Number(liters);
    const a = amount.trim() === '' ? undefined : Number(amount);
    if (l !== undefined && (!Number.isFinite(l) || l < 0)) {
      setErr(t('invalidLiters'));
      return;
    }
    if (a !== undefined && (!Number.isFinite(a) || a < 0)) {
      setErr(t('invalidAmount'));
      return;
    }
    void save({ liters: l, amountWon: a });
  };

  const chip =
    'rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:border-primary hover:text-primary disabled:opacity-60';
  const chipActive = 'border-primary bg-primary/10 text-primary';
  const literChipCls = (l: number) => (recentLiters === l ? `${chip} ${chipActive}` : chip);
  const amountChipCls = (a: number) => (recentAmount === a ? `${chip} ${chipActive}` : chip);

  // 단축입력 보조 표시: 현재가를 알면 입력값으로 반대편을 추정해 안내(저장값은 입력 그대로).
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
    // 라이트 톤 고정(다크 변형 없이 흰 카드) — 알림 성격의 모달이라 시인성 우선.
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('dwellDialogAria')}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-gray-800 shadow-2xl sm:rounded-2xl sm:pb-4"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-bold text-gray-900">
            {t.rich('dwellQuestion', {
              stationName,
              name: (chunks) => <span className="text-primary">{chunks}</span>,
            })}{' '}
            <FuelIcon className="ml-0.5 inline-block h-5 w-5 align-text-bottom text-primary" />
          </p>
          <button
            onClick={onClose}
            aria-label={tCommon('close')}
            className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('dwellHint')}</p>

        <p className="mt-3 text-xs font-semibold text-gray-700">{t('litersLabel')}</p>
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
          <button
            className={chip}
            disabled={state === 'busy'}
            onClick={() => void save({})}
            title={t('fillUpHintDwell')}
          >
            {t('fillUp')}
          </button>
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
            <span className="sr-only">{t('litersLabel')}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              placeholder={t('litersPlaceholder')}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
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
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
            />
          </label>
        </div>

        {canEstimate && estAmount != null && (
          <p className="mt-1.5 text-[11px] text-gray-500">
            {t('estAmount', { amount: estAmount.toLocaleString(), unitPrice: unitPrice!.toLocaleString() })}
          </p>
        )}
        {canEstimate && estLiters != null && (
          <p className="mt-1.5 text-[11px] text-gray-500">
            {t('estLiters', { liters: estLiters, unitPrice: unitPrice!.toLocaleString() })}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={state === 'busy'}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 disabled:opacity-60"
          >
            {t('no')}
          </button>
          <button
            onClick={saveManual}
            disabled={state === 'busy'}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {state === 'busy' ? t('saving') : t('confirm')}
          </button>
        </div>
        {err && <p className="mt-1.5 text-center text-xs text-red-500">{err}</p>}
      </div>
    </div>
  );
}
