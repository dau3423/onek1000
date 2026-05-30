'use client';

import { useEffect, useState } from 'react';

interface Coords { lat: number; lng: number; accuracy?: number }

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

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ coords: null, error: 'Geolocation 미지원', status: 'unavailable' });
      return;
    }

    // 위치 측정 시작 — 결과가 올 때까지 'locating'
    setState((s) => ({ ...s, status: s.coords ? s.status : 'locating', error: null }));

    const id = navigator.geolocation.watchPosition(
      (pos) => setState({
        coords: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        error: null,
        status: 'granted',
      }),
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
