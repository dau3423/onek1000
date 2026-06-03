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

// EV 상세는 결제/주유소 상세와 동일하게 라이트 전용(다크모드여도 화이트로 통일) → dark: 변형 없음.
const TONE_CLASS: Record<'available' | 'busy' | 'off', string> = {
  available: 'bg-emerald-100 text-emerald-700',
  busy: 'bg-amber-100 text-amber-700',
  off: 'bg-gray-200 text-gray-500',
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
 * 재진입(remount) 시에도 initial.syncedAt(DB synced_at) 기준 남은 쿨다운을 "첫 렌더부터" 복원한다.
 * 서버 debounce(60초, synced_at 기준)와 동일 신호로 정렬되므로, 뒤로 갔다 재진입해도 60초가 초기화되지 않는다.
 */

/** initial.syncedAt 기준, 마운트 시점에 다음 새로고침이 가능해지는 시각(ms epoch). 최근 갱신이 아니면 0. */
function cooldownUntilFromSyncedAt(syncedAt: string | null): number {
  if (!syncedAt) return 0;
  const ms = Date.parse(syncedAt); // synced_at은 timestamptz(오프셋 포함)라 로컬/UTC 혼동 없이 정확히 파싱됨.
  if (Number.isNaN(ms)) return 0;
  const elapsed = Date.now() - ms;
  // 미래값(시계 오차 등)도 60초 상한으로만 막아 과도하게 오래 막히지 않게 한다.
  if (elapsed < 0) return Date.now() + EV_LIVE_REFRESH_COOLDOWN_MS;
  const remaining = EV_LIVE_REFRESH_COOLDOWN_MS - elapsed;
  return remaining > 0 ? Date.now() + remaining : 0;
}

/** cooldownUntil(ms epoch) → 지금 기준 남은 초(올림). 0 이하면 0. */
function leftSecondsUntil(until: number): number {
  if (until <= 0) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1_000));
}

export function EvChargerStatusPanel({ statId, initial }: Props) {
  const [chargers, setChargers] = useState<EvChargerUnit[]>(initial.chargers);
  const [totalChargers, setTotalChargers] = useState(initial.totalChargers);
  const [availableChargers, setAvailableChargers] = useState(initial.availableChargers);
  const [syncedAt, setSyncedAt] = useState<string | null>(initial.syncedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // 다음 새로고침이 가능해지는 시각(ms epoch). 0이면 즉시 가능.
  // 재진입(remount) 시 깜빡임/한 틱 활성 없이 첫 렌더부터 비활성이 보장되도록 useState 초기값(lazy)에서 동기 계산한다.
  const [cooldownUntil, setCooldownUntil] = useState(() => cooldownUntilFromSyncedAt(initial.syncedAt));
  // 남은 쿨다운(초). 카운트다운 표시 + 버튼 비활성 판정. cooldownUntil과 같은 신호로 초기값을 동기 계산.
  const [cooldownLeft, setCooldownLeft] = useState(() => leftSecondsUntil(cooldownUntilFromSyncedAt(initial.syncedAt)));

  // 쿨다운 카운트다운: 1초마다 남은 초 계산, 0이 되면 정리.
  useEffect(() => {
    if (cooldownUntil <= 0) {
      setCooldownLeft(0);
      return;
    }
    const tick = () => {
      const left = leftSecondsUntil(cooldownUntil);
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
    // 갱신 중이거나 쿨다운 중이면 무시(연타/스팸 방지). cooldownUntil은 초기값에서 이미 복원되어 있다.
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
      // 성공 시: 응답 syncedAt 기준으로 쿨다운을 잡아 서버 debounce와 정렬(없으면 지금부터 60초).
      setCooldownUntil(cooldownUntilFromSyncedAt(detail.syncedAt) || Date.now() + EV_LIVE_REFRESH_COOLDOWN_MS);
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
      <section className="border-t border-gray-100 px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-800">충전기 현황</h2>
          <div className="flex items-center gap-2">
            {/* 라이브 갱신 시각: synced_at(우리 DB에 막 반영된 시각) 기준 "방금 갱신 / N초 전". */}
            <span className="flex items-center gap-1 text-xs text-gray-400">
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
              className="flex h-7 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
            >
              <span className={loading ? 'inline-block animate-spin' : 'inline-block'} aria-hidden>↻</span>
              {loading ? '갱신 중' : onCooldown ? `${cooldownLeft}초 후 가능` : '새로고침'}
            </button>
          </div>
        </div>
        <p className="mt-1 text-2xl font-extrabold text-emerald-600">
          {availableChargers}
          <span className="ml-1 text-sm font-medium text-gray-400">/ {totalChargers}대 사용 가능</span>
        </p>
        {/* 상태별 요약 배지 (사용가능/충전중/그 외). 충전기 여러 대일 때 한눈에 보기. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            사용가능 {available}
          </span>
          {busy > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              충전중 {busy}
            </span>
          )}
          {other > 0 && (
            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
              기타 {other}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-2 text-xs text-amber-600">
            실시간 상태를 가져오지 못했어요. 잠시 후 다시 시도해 주세요. (현재 표시는 최근 저장값)
          </p>
        )}
      </section>

      {/* 충전기 목록 */}
      <section className="border-t border-gray-100 px-5 py-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">충전기 ({chargers.length}대)</h2>
        <ul className="divide-y divide-gray-100">
          {chargers.map((c) => {
            const tone = chargerStatTone(c.stat);
            const speed = chargerSpeed(c.chgerType, c.output);
            return (
              <li key={c.chgerId} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {chargerTypeLabel(c.chgerType)}
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      {speed === 'fast' ? '급속' : '완속'}{c.output != null ? ` · ${c.output}kW` : ''}
                    </span>
                  </p>
                  {c.statUpdAt && (
                    <p className="mt-0.5 text-[11px] text-gray-400">{relativeFromNow(c.statUpdAt)}</p>
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
