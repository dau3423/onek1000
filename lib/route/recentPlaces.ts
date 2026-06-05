// 경로별 최저가 화면의 "최근/자주 가는 위치" 저장 헬퍼.
// 외부 서버 호출 없이 localStorage에만 기록한다(클라이언트 전용).
// 저장 패턴은 stores/map.ts의 routePlan localStorage 래퍼를 따른다(typeof window 가드 + try/catch).

import type { RoutePoint } from '@/types/station';

const KEY = 'onek:recentPlaces';

/** 내부 보관 상한(너무 커지지 않도록). 화면엔 이 중 상위 20개만 노출. */
const MAX_STORE = 50;
/** 화면 노출 상한. */
export const MAX_VISIBLE = 20;

/** 동일 위치 판정용 좌표 근접 임계값(도 단위, 약 50m 안팎). place id가 없을 때 사용. */
const COORD_EPS = 0.0005;

/**
 * 최근/자주 탐색한 위치 1건.
 * - placeId: 카카오 장소 id(있으면 동일성 판정의 1순위 키)
 * - count: 누적 탐색 횟수(빈도)
 * - lastAt: 마지막 탐색 시각(ms epoch)
 */
export interface RecentPlace {
  placeId?: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
  lastAt: number;
}

/** 새 위치를 기록할 때 호출부에서 넘기는 입력(빈도/시각은 내부에서 관리). */
export type RecentPlaceInput = {
  placeId?: string;
  name: string;
  lat: number;
  lng: number;
};

function isSamePlace(a: RecentPlace, b: RecentPlaceInput): boolean {
  // place id가 양쪽에 있으면 그것으로만 판정(가장 정확).
  if (a.placeId && b.placeId) return a.placeId === b.placeId;
  // id가 없으면 이름 + 좌표 근접으로 판정(중복 누적 방지).
  const sameName = a.name === b.name;
  const near = Math.abs(a.lat - b.lat) < COORD_EPS && Math.abs(a.lng - b.lng) < COORD_EPS;
  return sameName && near;
}

function readRaw(): RecentPlace[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 손상/구버전 값 방어 — 필수 필드 타입 검증 후 통과한 것만.
    return parsed.filter(
      (v): v is RecentPlace =>
        v &&
        typeof v.name === 'string' &&
        typeof v.lat === 'number' &&
        typeof v.lng === 'number' &&
        typeof v.count === 'number' &&
        typeof v.lastAt === 'number',
    );
  } catch {
    return [];
  }
}

function writeRaw(list: RecentPlace[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_STORE)));
  } catch {
    // 프라이빗 모드 등 localStorage 불가 환경은 무시(기능만 비활성).
  }
}

/**
 * 화면 표시용 목록을 반환한다.
 * 정렬: 빈도(count) 내림차순 → 동률이면 최근 탐색(lastAt) 내림차순. 최대 MAX_VISIBLE개.
 */
export function getRecentPlaces(): RecentPlace[] {
  return readRaw()
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, MAX_VISIBLE);
}

/**
 * 위치 1건을 기록한다(탐색 시 호출).
 * 같은 위치가 이미 있으면 count++ & lastAt 갱신(중복 누적 금지), 없으면 신규 추가.
 * 반환값은 갱신 후 화면 표시용 목록.
 */
export function recordRecentPlace(input: RecentPlaceInput): RecentPlace[] {
  if (typeof window === 'undefined') return [];
  const name = input.name?.trim();
  if (!name) return getRecentPlaces();

  const list = readRaw();
  const now = Date.now();
  const idx = list.findIndex((p) => isSamePlace(p, input));
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = {
      ...prev,
      // 좌표/이름/placeId는 최신 값으로 보정(이전 저장이 부정확했을 수 있음).
      placeId: input.placeId ?? prev.placeId,
      name,
      lat: input.lat,
      lng: input.lng,
      count: prev.count + 1,
      lastAt: now,
    };
  } else {
    list.push({ placeId: input.placeId, name, lat: input.lat, lng: input.lng, count: 1, lastAt: now });
  }

  // 저장 상한 관리: 빈도/최근 순으로 정렬 후 MAX_STORE까지만 보관(오래·드물게 쓴 항목부터 탈락).
  const sorted = list.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).slice(0, MAX_STORE);
  writeRaw(sorted);
  return sorted.slice(0, MAX_VISIBLE);
}

/** 특정 위치 1건 삭제(개별 ✕). 반환값은 삭제 후 화면 표시용 목록. */
export function removeRecentPlace(target: RecentPlace): RecentPlace[] {
  if (typeof window === 'undefined') return [];
  const list = readRaw().filter((p) => !isSamePlace(p, target));
  writeRaw(list);
  return list
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, MAX_VISIBLE);
}

/** 전체 지우기. */
export function clearRecentPlaces(): RecentPlace[] {
  if (typeof window === 'undefined') return [];
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
  return [];
}

/** RoutePoint(좌표+이름)로 변환 — 도착지 입력에 채울 때 사용. */
export function toRoutePoint(p: RecentPlace): RoutePoint {
  return { lat: p.lat, lng: p.lng, name: p.name };
}
