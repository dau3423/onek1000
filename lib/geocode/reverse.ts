// 좌표 → 주소(역지오코딩) — 서버 전용, **표시 전용**.
//
// ⚠️⚠️ 이 결과는 절대 DB 에 저장하지 않는다.
//   카카오 로컬 API 이용약관은 "실시간 호출 기반의 사용만 가능하며, 데이터 저장 등의 목적으로는
//   호출이 불가"라고 명시한다. 이 모듈은 긴급 화면이 "지금 내가 어디인지"를 **화면에 보여주기
//   위해서만** 쓴다. 호출부에 저장 로직을 붙이지 말 것.
//   (같은 이유로 lib/geocode/kakao.ts 의 정방향 지오코딩은 sync 에서만 쓰도록 제한돼 있다 —
//    그쪽은 좌표를 DB 에 넣으므로 성격이 다르다. 이 파일과 혼동하지 말 것.)
//
// 왜 필요한가: 사고·고장 현장에서 가장 흔한 곤란은 "여기가 어딘지 모르겠다"이다.
// 보험사 상담원은 어차피 구두로 위치를 확인하므로, 읽어 줄 수 있는 주소 한 줄이 실질적인 도움이 된다.

const COORD2ADDR_URL = 'https://dapi.kakao.com/v2/local/geo/coord2address.json';

const TIMEOUT_MS = 4000;

function getKey(): string | undefined {
  return process.env.KAKAO_REST_API_KEY ?? process.env.KAKAO_CLIENT_ID;
}

export function isReverseGeocodeConfigured(): boolean {
  return Boolean(getKey());
}

export interface ReverseAddress {
  /** 도로명주소(있으면 이걸 먼저 보여준다). */
  road: string | null;
  /** 지번주소 — 도로명이 없는 지역(고속도로·산간 등)에서 대체로 쓰인다. */
  jibun: string | null;
}

interface KakaoAddrDoc {
  road_address?: { address_name?: string } | null;
  address?: { address_name?: string } | null;
}

/**
 * 좌표 → 주소. 실패하면 null 을 돌려주고 화면은 좌표만 보여준다.
 * **절대 throw 하지 않는다** — 긴급 화면이 주소 조회 실패로 깨지면 안 된다.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseAddress | null> {
  const key = getKey();
  if (!key) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    // 카카오는 x=경도, y=위도 순서다(위경도 반대로 넣는 실수가 잦다).
    const url = `${COORD2ADDR_URL}?x=${encodeURIComponent(String(lng))}&y=${encodeURIComponent(String(lat))}`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: ac.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { documents?: KakaoAddrDoc[] };
    const doc = json.documents?.[0];
    if (!doc) return null;
    const road = doc.road_address?.address_name?.trim() || null;
    const jibun = doc.address?.address_name?.trim() || null;
    if (!road && !jibun) return null;
    return { road, jibun };
  } catch {
    return null;   // 네트워크·타임아웃·파싱 실패 — 좌표만으로도 화면은 성립한다
  } finally {
    clearTimeout(timer);
  }
}
