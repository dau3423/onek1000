'use client';

import { useEffect, useState } from 'react';

interface Coords { lat: number; lng: number; accuracy?: number }

interface GeoState {
  coords: Coords | null;
  error: string | null;
  status: 'idle' | 'prompt' | 'granted' | 'denied' | 'unavailable';
}

/** Geolocation watchPosition 훅. enabled=true 일 때만 추적. */
export function useGeolocation(enabled: boolean): GeoState & {
  request: () => void;
} {
  const [state, setState] = useState<GeoState>({
    coords: null, error: null, status: 'idle',
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ coords: null, error: 'Geolocation 미지원', status: 'unavailable' });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => setState({
        coords: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        error: null,
        status: 'granted',
      }),
      (err) => setState({
        coords: null,
        error: err.message,
        status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
      }),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  const request = () => setState((s) => ({ ...s, status: 'prompt' }));

  return { ...state, request };
}
