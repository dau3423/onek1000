// Upstash Redis REST 클라이언트 (서버 전용)
// 환경변수 미설정 시 noop으로 동작 — MVP/개발에선 영향 없음.

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const enabled = Boolean(URL_ && TOKEN);

async function call(args: (string | number)[]): Promise<unknown> {
  if (!enabled) return null;
  const res = await fetch(`${URL_}/${args.map((x) => encodeURIComponent(String(x))).join('/')}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Upstash ${args[0]} ${res.status}`);
  const data = await res.json();
  return data.result;
}

export const redis = {
  enabled,

  async getJson<T>(key: string): Promise<T | null> {
    if (!enabled) return null;
    try {
      const raw = (await call(['get', key])) as string | null;
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      console.warn('redis get fail', e);
      return null;
    }
  },

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!enabled) return;
    try {
      await call(['set', key, JSON.stringify(value), 'EX', ttlSec]);
    } catch (e) {
      console.warn('redis set fail', e);
    }
  },

  async del(...keys: string[]): Promise<void> {
    if (!enabled) return;
    try {
      await call(['del', ...keys]);
    } catch (e) {
      console.warn('redis del fail', e);
    }
  },

};

// ─── 캐시 키 빌더 ───
export const keys = {
  bbox: (z: number, prod: string, q: string) => `bbox:z${z}:${prod}:${q}`,
  nationalTop10: (prod: string) => `top10:nation:${prod}`,
  radius: (prod: string, q: string, r: number) => `radius:${prod}:${q}:r${r}`,
  detail: (id: string) => `station:${id}`,
  avgNation: () => `avg:nation`,
  avgSido: (prod: string) => `avg:sido:${prod}`,
  evBbox: (q: string) => `ev:bbox:${q}`,
  // 주차장 bbox(지도 영역) 조회 — 좌표 격자 + 영역 크기(+무료만 필터).
  parkingBbox: (q: string) => `parking:bbox:${q}`,
  // 세차장 bbox(지도 영역) 조회 — 좌표 격자만. 유형 필터는 클라이언트에서 적용하므로 캐시 차원에 없음.
  carwashBbox: (q: string) => `carwash:bbox:${q}`,
  repairBbox: (q: string) => `repair:bbox:${q}`,
  rentalBbox: (q: string) => `rental:bbox:${q}`,
  // 화면 영역 내 전체 주유소(회색 점) — 가격/유종 무관, 좌표만. 줌(z)+격자로 분리.
  stationsInBbox: (z: number, q: string) => `allstn:z${z}:${q}`,
  // 지역 가격 추세(④ 타이밍 배너) — 유종+격자+반경. 추세는 1일 단위 변화라 TTL 길게(1h).
  priceTrend: (prod: string, q: string, r: number) => `trend:${prod}:${q}:r${r}`,
  // (레이트리밋 3종은 마이그레이션 0056으로 DB(rate_limits)로 옮겼다 — lib/db/rateLimit.ts)
  // (해당 상세 가격 캐시/쿨다운은 마이그레이션 0054로 DB(prices_ondemand)로 옮겼다 — lib/db/priceCache.ts)
  // 일일 최저가 TOP10 트윗 발행 멱등키 — 같은 날짜 중복 발행 방지(날짜별, TTL 3일).
  dailyTweet: (date: string) => `tweet:posted:${date}`,
};

/** 좌표 양자화: precision=3 → 약 110m 격자, 4 → 11m (2 → 약 1.1km, 1 → 약 11km) */
export function geoQuantize(lat: number, lng: number, precision = 3): string {
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
}

/**
 * 지도 영역(bbox) 캐시 키 조각 — **중심 격자 + 영역 크기**.
 *
 * 크기를 빼면 안 되는 이유: 응답 본문은 요청한 bbox로 걸러진 목록인데, 같은 줌·같은 중심이라도
 * 화면 크기에 따라 실제 영역 넓이가 10배 이상 차이난다(폰 세로 vs 데스크톱 전체화면).
 * 크기가 키에 없으면 모바일이 먼저 캐시한 좁은 결과가 데스크톱 사용자에게 그대로 나가,
 * 자기 화면의 일부만 채워진 "잘린 지도"가 되고 TTL 동안 새로고침해도 그대로다.
 *
 * 크기는 중심보다 한 단계 촘촘하게(precision+1) 잡는다 — 크게 잡으면 확대 상태에서 폭·높이가
 * 전부 "0.00"으로 뭉개져 크기 차원이 사라진다.
 *
 * 남는 근사: 중심을 격자로 접으므로 캐시된 응답의 영역이 요청 영역과 최대 격자 크기만큼
 * 어긋날 수 있다(경계에서 약간의 누락/과잉). 이건 이 캐시 설계가 원래 감수한 근사다.
 */
export function bboxCacheKey(
  bbox: { swLat: number; swLng: number; neLat: number; neLng: number },
  precision = 2,
): string {
  const cx = (bbox.swLat + bbox.neLat) / 2;
  const cy = (bbox.swLng + bbox.neLng) / 2;
  const h = Math.abs(bbox.neLat - bbox.swLat);
  const w = Math.abs(bbox.neLng - bbox.swLng);
  const sp = precision + 1;
  return `${geoQuantize(cx, cy, precision)}:${w.toFixed(sp)}x${h.toFixed(sp)}`;
}
