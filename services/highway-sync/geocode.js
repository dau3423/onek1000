// 카카오 로컬 지오코딩(주소/키워드 → WGS84 좌표) — 서버 전용.
// === lib/geocode/kakao.ts 에서 포팅(self-contained) ===
// 키는 KAKAO_REST_API_KEY ↦ KAKAO_CLIENT_ID 폴백(기존 geocode/directions 와 동일).

const ADDRESS_URL = 'https://dapi.kakao.com/v2/local/search/address.json';
const KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

function getKey() {
  return process.env.KAKAO_REST_API_KEY ?? process.env.KAKAO_CLIENT_ID;
}

/** 카카오 지오코딩 사용 가능 여부(키 존재). */
export function isGeocodeConfigured() {
  return Boolean(getKey());
}

const KEY_HEADER = (key) => ({ Authorization: `KakaoAK ${key}` });

function pickCoord(docs) {
  const d = docs?.[0];
  if (!d) return null;
  const lng = Number(d.x);
  const lat = Number(d.y);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  // 대한민국 경위도 대략 범위 밖이면 잘못된 결과로 간주.
  if (lng < 124 || lng > 132 || lat < 33 || lat > 39) return null;
  return { lat, lng };
}

async function callKakao(url, query, key) {
  const u = new URL(url);
  u.searchParams.set('query', query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(u, { headers: KEY_HEADER(key), cache: 'no-store', signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    return json.documents ?? [];
  } catch {
    return null; // 타임아웃/네트워크 — 호출부에서 좌표 미확보로 처리
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 주소 → 좌표. 주소 검색 실패 시 fallbackKeyword(휴게소명)로 키워드 검색.
 * 둘 다 실패하면 null(호출부에서 적재 보류).
 */
export async function geocode(address, fallbackKeyword) {
  const key = getKey();
  if (!key) return null;

  const addr = String(address ?? '').trim();
  if (addr) {
    const byAddr = pickCoord((await callKakao(ADDRESS_URL, addr, key)) ?? undefined);
    if (byAddr) return byAddr;
  }

  const kw = String(fallbackKeyword ?? '').trim();
  if (kw) {
    const byKw = pickCoord((await callKakao(KEYWORD_URL, kw, key)) ?? undefined);
    if (byKw) return byKw;
  }

  return null;
}
