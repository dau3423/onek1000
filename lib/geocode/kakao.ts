// 카카오 로컬 지오코딩(주소/키워드 → WGS84 좌표) — 서버 전용.
// 키는 서버 전용(NEXT_PUBLIC 금지). 기존 directions.ts와 동일하게 KAKAO_REST_API_KEY ↦ KAKAO_CLIENT_ID 폴백.
// 메모리 규칙: 외부 API는 1일 1회 sync에서만 호출한다(상세/조회 실시간 호출 금지).
// 고속도로 휴게소 주유소는 가격 API에 좌표가 없어, sync 단계에서 svarAddr를 1회 변환해 DB에 저장한다.

const ADDRESS_URL = 'https://dapi.kakao.com/v2/local/search/address.json';
const KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

function getKey(): string | undefined {
  return process.env.KAKAO_REST_API_KEY ?? process.env.KAKAO_CLIENT_ID;
}

/** 카카오 지오코딩 사용 가능 여부(키 존재). */
export function isGeocodeConfigured(): boolean {
  return Boolean(getKey());
}

interface KakaoDoc {
  x?: string; // 경도(lng)
  y?: string; // 위도(lat)
}
interface KakaoResp {
  documents?: KakaoDoc[];
}

const KEY_HEADER = (key: string) => ({ Authorization: `KakaoAK ${key}` });

function pickCoord(docs?: KakaoDoc[]): { lat: number; lng: number } | null {
  const d = docs?.[0];
  if (!d) return null;
  const lng = Number(d.x);
  const lat = Number(d.y);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  // 대한민국 경위도 대략 범위 밖이면 잘못된 결과로 간주.
  if (lng < 124 || lng > 132 || lat < 33 || lat > 39) return null;
  return { lat, lng };
}

async function callKakao(url: string, query: string, key: string): Promise<KakaoDoc[] | null> {
  const u = new URL(url);
  u.searchParams.set('query', query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(u, { headers: KEY_HEADER(key), cache: 'no-store', signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as KakaoResp;
    return json.documents ?? [];
  } catch {
    return null; // 타임아웃/네트워크 — 호출부에서 좌표 미확보로 처리
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 주소 → 좌표. 주소 검색 실패 시 fallbackKeyword(예: 휴게소명)로 키워드 검색을 시도한다.
 * 둘 다 실패하면 null(호출부에서 적재 보류).
 */
export async function geocode(
  address: string | null | undefined,
  fallbackKeyword?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const key = getKey();
  if (!key) return null;

  const addr = String(address ?? '').trim();
  if (addr) {
    const byAddr = pickCoord(await callKakao(ADDRESS_URL, addr, key) ?? undefined);
    if (byAddr) return byAddr;
  }

  const kw = String(fallbackKeyword ?? '').trim();
  if (kw) {
    const byKw = pickCoord(await callKakao(KEYWORD_URL, kw, key) ?? undefined);
    if (byKw) return byKw;
  }

  return null;
}
