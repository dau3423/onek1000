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

  /**
   * 카운터 증가(rate limit용). INCR 후 첫 증가(반환값 1)면 EXPIRE로 TTL을 건다.
   * 반환: 현재 카운트(number). 미설정(enabled=false)/에러 시 0 → 호출부에서 '통과'로 해석.
   * throw하지 않고 graceful 처리(setJson/del 패턴과 동일).
   */
  async incrWithTtl(key: string, windowSec: number): Promise<number> {
    if (!enabled) return 0;
    try {
      const count = (await call(['incr', key])) as number;
      if (count === 1) await call(['expire', key, windowSec]);
      return count;
    } catch (e) {
      console.warn('redis incr fail', e);
      return 0;
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
  // 화면 영역 내 전체 주유소(회색 점) — 가격/유종 무관, 좌표만. 줌(z)+격자로 분리.
  stationsInBbox: (z: number, q: string) => `allstn:z${z}:${q}`,
  // 지역 가격 추세(④ 타이밍 배너) — 유종+격자+반경. 추세는 1일 단위 변화라 TTL 길게(1h).
  priceTrend: (prod: string, q: string, r: number) => `trend:${prod}:${q}:r${r}`,
  // 방문 ping rate limit — IP당 분당 카운터(공개 POST /api/visit 남용 방어).
  visitRate: (ip: string) => `rl:visit:${ip}`,
  // 비순위(가격 없는) 주유소 상세에서 on-demand로 받은 Opinet 실시간 가격 캐시(가격만).
  // prices_latest에는 쓰지 않아 지도 마커 불변. KST 자정까지 TTL.
  detailPrice: (id: string) => `detailprice:${id}`,
  // Opinet 할당량 소진/연속 무효 응답 시 전역 쿨다운 플래그 — set 동안 상세에서 Opinet 헛호출 차단.
  detailPriceCooldown: () => `detailprice:cooldown`,
  // 일일 최저가 TOP10 트윗 발행 멱등키 — 같은 날짜 중복 발행 방지(날짜별, TTL 3일).
  dailyTweet: (date: string) => `tweet:posted:${date}`,
};

/** 좌표 양자화: precision=3 → 약 110m 격자, 4 → 11m */
export function geoQuantize(lat: number, lng: number, precision = 3): string {
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
}
