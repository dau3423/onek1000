'use client';

// 마이페이지 "지도로 보기" 전용 경량 지도.
// 메인 KakaoMap은 메인 지도 상태(스토어/레이어/bbox/클러스터)와 강결합이라 재사용하지 않고,
// loadKakao + CustomOverlay 핀 + bounds fit 만 하는 가벼운 전용 컴포넌트를 둔다(라이트 톤).
// 핀에는 방문 횟수를 배지로 표시하고, 탭하면 /station/{id} 상세로 이동한다.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadKakao } from '@/components/map/loadKakao';
import type { FuelLogStation } from '@/types/fuel-log';

interface Props {
  stations: FuelLogStation[];
}

export function MyStationsMap({ stations }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 지도 초기화는 async라 마운트 시점엔 mapRef가 null. ref 변경은 effect 재실행을 트리거하지 않으므로,
  // 준비 완료를 state로 알려 핀 렌더 effect가 지도 준비 후 재실행되게 한다(메인 KakaoMap의 ready 패턴과 동일).
  const [mapReady, setMapReady] = useState(false);

  // 지도 초기화(1회). 키 없음/로드 실패는 안내 문구로 폴백(페이지는 깨지지 않음).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const kakao = await loadKakao();
        if (!alive || !containerRef.current) return;
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(37.5665, 126.978), // 서울시청(초기값, 곧 bounds fit으로 대체)
          level: 8,
        });
        mapRef.current = map;
        setMapReady(true);
      } catch {
        if (alive) setError('지도를 불러오지 못했어요.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 핀 렌더 + bounds fit. stations 또는 지도 준비 상태 변경 시 갱신(둘 중 무엇이 먼저 와도 그려지게).
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const kakao = window.kakao;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const pts = stations.filter((s) => s.lat != null && s.lng != null);
    if (pts.length === 0) return;

    const bounds = new kakao.maps.LatLngBounds();

    for (const s of pts) {
      const pos = new kakao.maps.LatLng(s.lat as number, s.lng as number);
      bounds.extend(pos);

      const content = document.createElement('div');
      content.style.cursor = 'pointer';
      content.innerHTML = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center">
          <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:9999px;background:#fff;border:1px solid #e5e7eb;box-shadow:0 1px 4px rgba(0,0,0,0.12);font-size:12px;font-weight:700;color:#111827;white-space:nowrap;max-width:140px">
            <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.stationName)}</span>
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:9999px;background:#ef4444;color:#fff;font-size:10px;line-height:16px">${s.visitCount}</span>
          </div>
          <div style="width:8px;height:8px;background:#fff;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;transform:rotate(45deg);margin-top:-4px"></div>
        </div>`;
      content.addEventListener('click', () =>
        router.push(`${s.isEv ? '/ev' : '/station'}/${encodeURIComponent(s.stationId)}`),
      );

      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content,
        yAnchor: 1,
        clickable: true,
        zIndex: 1,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    // 내 주유소가 모두 보이도록 화면 맞춤. 1곳이면 적당히 확대.
    if (pts.length === 1) {
      map.setCenter(new kakao.maps.LatLng(pts[0].lat as number, pts[0].lng as number));
      map.setLevel(5);
    } else {
      map.setBounds(bounds);
    }
  }, [stations, router, mapReady]);

  if (error) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-sm text-gray-500">
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[420px] w-full overflow-hidden rounded-xl border border-gray-100"
      aria-label="내가 주유한 주유소 지도"
    />
  );
}

// 주유소명은 사용자 입력이 아니라 DB 스냅샷이지만, innerHTML 주입이므로 최소 이스케이프.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
