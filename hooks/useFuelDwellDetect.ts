'use client';

// 주유소 체류 감지 훅 (지오펜스 + dwell)
// 포그라운드(앱 켜둠) + GPS 추적 중에만 동작 — 웹 한계로 백그라운드 감지는 불가(정상, 범위 밖).
//
// 동작:
//  1) 현재 위치가 주유소 반경 GEOFENCE_RADIUS_M(50m) 안에 들면 그 주유소를 "후보"로 잡고 체류 타이머 시작.
//  2) DWELL_MS(2분) 이상 체류한 뒤 그 반경을 벗어나면 → "주유했음" 추정 → onDetect 콜백(팝업 표시).
//  3) 같은 주유소는 DEDUP_MS(2시간) 내 재감지/재팝업하지 않는다(localStorage 기록, 닫아도 억제).
//
// 과호출/배터리 방어:
//  - 최근접 주유소는 GPS 갱신마다가 아니라 좌표가 의미있게 바뀔 때(양자화)만 작은 반경으로 1회 조회.
//  - GPS 튐 방어: 진입/이탈을 연속 ENTER_HITS/LEAVE_HITS회 확인해야 확정(히스테리시스 포함).
//  - 후보가 바뀌면 상태 리셋.

import { useEffect, useRef } from 'react';
import { distanceMeters, quantize } from '@/lib/map/geo';
import type { StationWithPrice } from '@/types/station';

export const GEOFENCE_RADIUS_M = 50; // 지오펜스 반경(진입 판정)
export const DWELL_MS = 120000; // 체류 기준(2분)
export const DEDUP_MS = 2 * 60 * 60 * 1000; // 같은 주유소 재팝업 금지(2시간)

// 이탈 판정 히스테리시스 — 진입(50m)보다 약간 큰 거리에서 벗어나야 '이탈'로 본다.
// GPS 지터로 경계선에서 들락날락하며 조기 이탈 처리되는 것을 방지.
const LEAVE_RADIUS_M = 70;
// 진입/이탈 확정에 필요한 연속 확인 횟수(GPS 튐 1~2회로 인한 오동작 방지).
const ENTER_HITS = 2;
const LEAVE_HITS = 2;
// 최근접 주유소 조회 반경(진입 판정 50m보다 약간 크게 — 경계 후보 누락 방지).
const NEAREST_QUERY_RADIUS_M = 80;

const DEDUP_STORAGE_KEY = 'onek.fuelDwell.dedup'; // { [stationId]: ts(ms) }

interface Coords {
  lat: number;
  lng: number;
}

/** 감지된 주유소(팝업 대상) — 최소 정보만. radius 응답의 StationWithPrice를 그대로 전달한다. */
export type DwellStation = StationWithPrice;

/** localStorage에서 중복방지 기록을 읽는다(파싱 실패/SSR 안전). */
function readDedup(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DEDUP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** 중복방지 기록에 stationId의 억제 시각(now)을 적고, 만료(2시간 경과)된 항목은 정리한다. */
function writeDedup(stationId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const map = readDedup();
    const next: Record<string, number> = {};
    for (const [id, ts] of Object.entries(map)) {
      if (typeof ts === 'number' && now - ts < DEDUP_MS) next[id] = ts;
    }
    next[stationId] = now;
    window.localStorage.setItem(DEDUP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* best-effort — 실패해도 기능 자체엔 영향 없음 */
  }
}

/** stationId가 현재 억제 중(2시간 내 기록)인지 */
function isSuppressed(stationId: string): boolean {
  const ts = readDedup()[stationId];
  return typeof ts === 'number' && Date.now() - ts < DEDUP_MS;
}

/**
 * 주유소 체류를 감지해 onDetect를 호출하는 훅.
 * @param coords  현재 GPS 좌표(없으면 비활성)
 * @param enabled false면 전체 비활성(비로그인/레이어 불일치 등). coords가 있어도 동작 안 함.
 * @param onDetect 체류 후 이탈이 확정됐을 때 호출(팝업 표시). 같은 주유소 2시간 내 재호출 안 함.
 */
export function useFuelDwellDetect(
  coords: Coords | null,
  enabled: boolean,
  onDetect: (station: DwellStation) => void,
): void {
  // 상태 머신 ref — 렌더 유발 없이 GPS 콜백 사이에서 상태를 잇는다.
  const candidateRef = useRef<DwellStation | null>(null); // 현재 후보(반경 내 최근접)
  const enterAtRef = useRef<number>(0); // 후보 진입 확정 시각(ms)
  const enterHitsRef = useRef<number>(0); // 진입 연속 확인 카운터
  const leaveHitsRef = useRef<number>(0); // 이탈 연속 확인 카운터
  const dwelledRef = useRef<boolean>(false); // 2분 체류 달성 여부(이탈 시 트리거 조건)

  // 최근접 주유소 조회 게이트 — 좌표 양자화 키가 바뀔 때만 1회 조회(과호출 방지).
  const lastQueryKeyRef = useRef<string | null>(null);
  const nearestRef = useRef<DwellStation | null>(null); // 직전 조회로 얻은 최근접(없으면 null)
  const queryAbortRef = useRef<AbortController | null>(null);

  // onDetect를 ref로 보관 — 콜백 신원이 매 렌더 바뀌어도 effect 의존성/재구독을 피한다.
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  // 상태 리셋(비활성/좌표 소실 시).
  const reset = () => {
    candidateRef.current = null;
    enterAtRef.current = 0;
    enterHitsRef.current = 0;
    leaveHitsRef.current = 0;
    dwelledRef.current = false;
  };

  // (1) 최근접 주유소 조회 — 좌표가 의미있게 바뀔 때만 작은 반경으로 1건 조회.
  // 한 자리에 머무르면 양자화 키가 안 바뀌어 진입 직후 1회만 호출된다(체류 감지엔 충분).
  useEffect(() => {
    if (!enabled || !coords) {
      nearestRef.current = null;
      return;
    }
    const key = quantize(coords.lat, coords.lng, 4); // ~11m 정밀도(50m 지오펜스에 적합)
    if (key === lastQueryKeyRef.current) return;
    lastQueryKeyRef.current = key;

    if (queryAbortRef.current) queryAbortRef.current.abort();
    const ac = new AbortController();
    queryAbortRef.current = ac;
    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      r: String(NEAREST_QUERY_RADIUS_M),
      product: 'B027', // 감지는 가격 무관 — 유종은 응답 형식상 임의 고정
      limit: '3',
    });
    fetch(`/api/stations/radius?${params}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`radius ${res.status}`);
        return (await res.json()) as { stations?: StationWithPrice[] };
      })
      .then((data) => {
        const list = Array.isArray(data?.stations) ? data.stations : [];
        // distance 오름차순으로 최근접 1건(응답은 가격순이라 거리로 재정렬).
        const nearest = [...list]
          .filter((s) => Number.isFinite(s.distance))
          .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))[0];
        nearestRef.current = nearest ?? null;
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') {
          // 조회 실패 시 최근접 미상(감지 스킵). 다음 좌표 변화에서 재시도.
          nearestRef.current = null;
        }
      });
  }, [enabled, coords?.lat, coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // (2) 체류 상태 머신 — 좌표 갱신마다 평가(거리 계산은 가벼움).
  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }
    if (!coords) return;
    const { lat, lng } = coords;

    const cand = candidateRef.current;

    if (!cand) {
      // 후보 없음 → 최근접이 50m 내면 진입 카운트. 2회 연속이면 후보 확정.
      const n = nearestRef.current;
      if (!n) return;
      const d = distanceMeters(lat, lng, n.lat, n.lng);
      if (d <= GEOFENCE_RADIUS_M && !isSuppressed(n.id)) {
        enterHitsRef.current += 1;
        if (enterHitsRef.current >= ENTER_HITS) {
          candidateRef.current = n;
          enterAtRef.current = Date.now();
          enterHitsRef.current = 0;
          leaveHitsRef.current = 0;
          dwelledRef.current = false;
        }
      } else {
        enterHitsRef.current = 0;
      }
      return;
    }

    // 후보 있음 → 후보와의 거리로 체류/이탈 평가.
    const dCand = distanceMeters(lat, lng, cand.lat, cand.lng);

    // 최근접이 다른 주유소로 명확히 바뀌면(후보보다 가깝고, 다른 id, 50m 내) 후보 교체.
    const n = nearestRef.current;
    if (
      n &&
      n.id !== cand.id &&
      distanceMeters(lat, lng, n.lat, n.lng) <= GEOFENCE_RADIUS_M &&
      distanceMeters(lat, lng, n.lat, n.lng) < dCand &&
      !isSuppressed(n.id)
    ) {
      candidateRef.current = n;
      enterAtRef.current = Date.now();
      leaveHitsRef.current = 0;
      dwelledRef.current = false;
      return;
    }

    // 체류 달성 판정(2분 경과 + 여전히 반경권).
    if (!dwelledRef.current && Date.now() - enterAtRef.current >= DWELL_MS && dCand <= LEAVE_RADIUS_M) {
      dwelledRef.current = true;
    }

    // 이탈 판정 — LEAVE_RADIUS_M 밖이 LEAVE_HITS회 연속이면 이탈 확정.
    if (dCand > LEAVE_RADIUS_M) {
      leaveHitsRef.current += 1;
      if (leaveHitsRef.current >= LEAVE_HITS) {
        const detected = cand;
        const wasDwelled = dwelledRef.current;
        // 후보 해제(다음 주유소 감지 준비).
        reset();
        // 2분 체류 후 이탈한 경우에만 "주유했음" 추정 → 팝업.
        if (wasDwelled && !isSuppressed(detected.id)) {
          writeDedup(detected.id); // 팝업 띄움과 동시에 2시간 억제(아니오로 닫아도 유지)
          onDetectRef.current(detected);
        }
      }
    } else {
      leaveHitsRef.current = 0;
    }
  }, [enabled, coords?.lat, coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
}
