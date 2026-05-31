'use client';

import { useEffect, useRef, useState } from 'react';
import { bearingDeg } from '@/lib/map/geo';

/**
 * heading(진행 방향, 0~360°, 북=0 시계방향). null이면 방향 정보 없음.
 * iOS Safari 등은 GPS heading을 제공하지 않거나 정지 시 null/NaN을 주므로,
 * 직전 좌표와의 방위각(bearing)으로 폴백한다.
 */
interface Coords { lat: number; lng: number; accuracy?: number; heading: number | null }

interface GeoState {
  coords: Coords | null;
  error: string | null;
  status: 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';
}

/**
 * Geolocation watchPosition 훅. enabled=true 일 때만 추적.
 * request()를 호출하면 attempt가 증가하여 watch를 (재)시작한다.
 * — 권한 거부/타임아웃 이후에도 버튼 재클릭으로 다시 시도할 수 있게 한다.
 */
export function useGeolocation(enabled: boolean): GeoState & {
  request: () => void;
} {
  const [state, setState] = useState<GeoState>({
    coords: null, error: null, status: 'idle',
  });
  // request() 호출마다 증가 → watch effect 재실행 트리거
  const [attempt, setAttempt] = useState(0);
  // 직전 좌표 — GPS heading이 없을 때 방위각(bearing) 폴백 계산용
  const lastCoordRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ coords: null, error: 'Geolocation 미지원', status: 'unavailable' });
      return;
    }

    // 위치 측정 시작 — 결과가 올 때까지 'locating'
    setState((s) => ({ ...s, status: s.coords ? s.status : 'locating', error: null }));

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        // 1) GPS가 주는 heading 우선 (정지/미지원이면 null 또는 NaN)
        const raw = pos.coords.heading;
        let heading: number | null =
          typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
        // 2) 폴백: 직전 좌표와의 방위각. 의미있는 이동(약 5m+)일 때만 계산해
        //    GPS 지터로 인한 방향 튐을 줄인다.
        if (heading === null) {
          const prev = lastCoordRef.current;
          if (prev) {
            const b = bearingDeg(prev.lat, prev.lng, latitude, longitude);
            if (b !== null) heading = b;
          }
        }
        lastCoordRef.current = { lat: latitude, lng: longitude };
        setState({
          coords: { lat: latitude, lng: longitude, accuracy, heading },
          error: null,
          status: 'granted',
        });
      },
      (err) => setState((s) => ({
        coords: s.coords, // 직전 좌표는 유지
        error: err.message,
        status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
      })),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, attempt]);

  const request = () => setAttempt((n) => n + 1);

  return { ...state, request };
}
