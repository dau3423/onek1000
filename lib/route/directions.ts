// 카카오내비 길찾기(서버 전용) — 출발/도착 좌표를 실제 도로 경로로 변환한다.
// 키는 서버 전용(NEXT_PUBLIC 금지). 운영은 KAKAO_CLIENT_ID(=REST 키), 로컬은 KAKAO_REST_API_KEY.
// 호출 실패/비정상 응답 시 null을 반환하므로, 호출부에서 직선 폴백을 적용할 수 있다.

const DIRECTIONS_URL = 'https://apis-navi.kakaomobility.com/v1/directions';

export interface DirectionsResult {
  /** 도로를 따라가는 경로 점들(가격 정렬 아님, 순서 = 주행 순서). x=lng, y=lat. */
  path: { lat: number; lng: number }[];
  /** 총 거리(m) */
  distance: number;
  /** 예상 소요(s) */
  duration: number;
}

function getKey(): string | undefined {
  return process.env.KAKAO_REST_API_KEY ?? process.env.KAKAO_CLIENT_ID;
}

/** 카카오내비 길찾기 호출 가능 여부(키 존재). mock/키 미설정 시 false. */
export function isDirectionsConfigured(): boolean {
  return Boolean(getKey());
}

/**
 * 출발→도착 도로 경로를 조회한다.
 * @param origin 출발 {lat,lng}
 * @param destination 도착 {lat,lng}
 * @returns 도로 경로 점들 + 거리/시간. 실패 시 null.
 */
export async function fetchRoadRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<DirectionsResult | null> {
  const key = getKey();
  if (!key) return null;

  // 파라미터는 x(경도),y(위도) 순서 — origin=lng,lat / destination=lng,lat
  const params = new URLSearchParams({
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    priority: 'RECOMMEND',
  });

  // 짧은 타임아웃(8s) — 실패 시 직선 폴백.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${DIRECTIONS_URL}?${params}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: controller.signal,
      // 길찾기는 캐시 의미가 적고 검색당 1회만 호출하므로 no-store.
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as KakaoDirectionsResponse;
    const route = json.routes?.[0];
    if (!route || route.result_code !== 0) return null;

    // sections[].roads[].vertexes(플랫 [x1,y1,x2,y2,...])를 순서대로 이어붙인다.
    const path: { lat: number; lng: number }[] = [];
    for (const section of route.sections ?? []) {
      for (const road of section.roads ?? []) {
        const v = road.vertexes ?? [];
        for (let i = 0; i + 1 < v.length; i += 2) {
          path.push({ lng: v[i], lat: v[i + 1] });
        }
      }
    }
    if (path.length < 2) return null;

    return {
      path,
      distance: route.summary?.distance ?? 0,
      duration: route.summary?.duration ?? 0,
    };
  } catch {
    // 타임아웃/네트워크 오류 → 폴백
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── 카카오내비 응답 타입(필요 필드만) ──
interface KakaoDirectionsResponse {
  routes?: {
    result_code: number;
    summary?: { distance?: number; duration?: number };
    sections?: {
      roads?: { vertexes?: number[] }[];
    }[];
  }[];
}
