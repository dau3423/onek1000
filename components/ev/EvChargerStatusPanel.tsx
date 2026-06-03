'use client';

import { useCallback, useEffect, useState } from 'react';
import { relativeFromNow, liveRelativeFromNow } from '@/lib/ev/format';
import { EV_LIVE_REFRESH_COOLDOWN_MS } from '@/lib/ev/constants';
import {
  chargerTypeLabel,
  chargerStatLabel,
  chargerStatTone,
  chargerSpeed,
  type EvChargerUnit,
  type EvStationDetail,
} from '@/types/ev';

interface Props {
  statId: string;
  /** 진입 시 서버가 DB로 즉시 렌더한 초기 스냅샷. 새로고침 버튼을 누르면 라이브값으로 교체. */
  initial: Pick<
    EvStationDetail,
    'totalChargers' | 'availableChargers' | 'syncedAt' | 'chargers'
  >;
}

const TONE_CLASS: Record<'available' | 'busy' | 'off', string> = {
  available: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  busy: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  off: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
};

/**
 * 충전기 현황 + 충전기 목록 (클라이언트).
 *
 * 진입 시엔 서버가 넘긴 DB 스냅샷(initial)을 그대로 즉시 표시(빠름).
 * "새로고침" 버튼을 누른 경우에만 갱신 라우트(POST /api/ev/[statId])를 호출해
 * data.go.kr 라이브 상태 → DB upsert → 갱신된 충전기 현황을 받아 화면에 반영한다.
 *
 * 견고성(서버 lib에서 보장): 8초 타임아웃, 60초 debounce(방금 갱신했으면 현재값 반환), 외부 호출은 서버에서만.
 * 클라는 실패 시 기존 표시를 유지하고 안내만 노출(페이지가 깨지지 않게).
 *
 * 과호출 방지: 새로고침 1회 후 60초 쿨다운(버튼 비활성 + 남은 시간 카운트다운).
 * 마운트 시 initial.syncedAt이 최근이면 그만큼 차감해 남은 쿨다운을 반영한다(이중 방어=서버 debounce).
 */

/** initial.syncedAt 기준, 마운트 시점에 남아 있는 쿨다운(ms). 최근 갱신이 아니면 0. */
function initialCooldownRemainingMs(syncedAt: string | null): number {
  if (!syncedAt) return 0;
  const ms = Date.parse(syncedAt);
  if (Number.isNaN(ms)) return 0;
  const elapsed = Date.now() - ms;
  if (elapsed < 0) return 0;
  return Math.max(0, EV_LIVE_REFRESH_COOLDOWN_MS - elapsed);
}

export function EvChargerStatusPanel({ statId, initial }: Props) {
  const [chargers, setChargers] = useState<EvChargerUnit[]>(initial.chargers);
  const [totalChargers, setTotalChargers] = useState(initial.totalChargers);
  const [availableChargers, setAvailableChargers] = useState(initial.availableChargers);
  const [syncedAt, setSyncedAt] = useState<string | null>(initial.syncedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // 다음 새로고침이 가능해지는 시각(ms epoch). 0이면 즉시 가능.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  // 남은 쿨다운(초). 1초마다 갱신해 카운트다운 표시.
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // 마운트 시 initial.syncedAt이 최근이면 남은 쿨다운을 반영(서버 debounce와 의미 일치).
  useEffect(() => {
    const remaining = initialCooldownRemainingMs(initial.syncedAt);
    if (remaining > 0) setCooldownUntil(Date.now() + remaining);
    // initial.syncedAt은 마운트 시 1회만 평가(이후는 refresh가 갱신).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 쿨다운 카운트다운: 1초마다 남은 초 계산, 0이 되면 정리.
  useEffect(() => {
    if (cooldownUntil <= 0) {
      setCooldownLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.ceil((cooldownUntil - Date.now()) / 1_000);
      if (left <= 0) {
        setCooldownLeft(0);
        setCooldownUntil(0);
      } else {
        setCooldownLeft(left);
      }
    };
    tick();
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const onCooldown = cooldownLeft > 0;
  const disabled = loading || onCooldown;

  const refresh = useCallback(async () => {
    // 갱신 중이거나 쿨다운 중이면 무시(연타/스팸 방지).
    if (loading || Date.now() < cooldownUntil) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/ev/${encodeURIComponent(statId)}`, {
        method: 'POST',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`refresh ${res.status}`);
      const detail = (await res.json()) as EvStationDetail;
      // 갱신된 라이브값으로 현황/목록을 교체. (실패 시 catch에서 기존값 유지)
      setChargers(detail.chargers);
      setTotalChargers(detail.totalChargers);
      setAvailableChargers(detail.availableChargers);
      setSyncedAt(detail.syncedAt);
      // 성공 시에만 60초 쿨다운 시작. (실패 시엔 즉시 재시도 허용 — 외부 호출은 서버 debounce가 막음)
      setCooldownUntil(Date.now() + EV_LIVE_REFRESH_COOLDOWN_MS);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [statId, loading, cooldownUntil]);

  const available = chargers.filter((c) => c.stat === '2').length;
  const busy = chargers.filter((c) => c.stat === '3').length;
  const other = chargers.length - available - busy;

  return (
    <>
      {/* 사용 가능 요약 (실시간) */}
      <section className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">충전기 현황</h2>
          <div className="flex items-center gap-2">
            {/* 라이브 갱신 시각: synced_at(우리 DB에 막 반영된 시각) 기준 "방금 갱신 / N초 전". */}
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              {liveRelativeFromNow(syncedAt)}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={disabled}
              aria-label={onCooldown ? `${cooldownLeft}초 후 새로고침 가능` : '충전기 현황 새로고침'}
              aria-busy={loading}
              title={onCooldown ? '잠시 후 다시 새로고침할 수 있어요.' : undefined}
              className="flex h-7 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:disabled:hover:bg-gray-800"
            >
              <span className={loading ? 'inline-block animate-spin' : 'inline-block'} aria-hidden>↻</span>
              {loading ? '갱신 중' : onCooldown ? `${cooldownLeft}초 후 가능` : '새로고침'}
            </button>
          </div>
        </div>
        <p className="mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
          {availableChargers}
          <span className="ml-1 text-sm font-medium text-gray-400 dark:text-gray-500">/ {totalChargers}대 사용 가능</span>
        </p>
        {/* 상태별 요약 배지 (사용가능/충전중/그 외). 충전기 여러 대일 때 한눈에 보기. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            사용가능 {available}
          </span>
          {busy > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              충전중 {busy}
            </span>
          )}
          {other > 0 && (
            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              기타 {other}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            실시간 상태를 가져오지 못했어요. 잠시 후 다시 시도해 주세요. (현재 표시는 최근 저장값)
          </p>
        )}
      </section>

      {/* 충전기 목록 */}
      <section className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-100">충전기 ({chargers.length}대)</h2>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {chargers.map((c) => {
            const tone = chargerStatTone(c.stat);
            const speed = chargerSpeed(c.chgerType, c.output);
            return (
              <li key={c.chgerId} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {chargerTypeLabel(c.chgerType)}
                    <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                      {speed === 'fast' ? '급속' : '완속'}{c.output != null ? ` · ${c.output}kW` : ''}
                    </span>
                  </p>
                  {c.statUpdAt && (
                    <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{relativeFromNow(c.statUpdAt)}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[tone]}`}>
                  {chargerStatLabel(c.stat)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
