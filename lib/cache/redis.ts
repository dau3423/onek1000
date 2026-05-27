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
  radius: (prod: string, q: string, r: number) => `radius:${prod}:${q}:r${r}`,
  detail: (id: string) => `station:${id}`,
  avgNation: () => `avg:nation`,
  avgSido: (prod: string) => `avg:sido:${prod}`,
};

/** 좌표 양자화: precision=3 → 약 110m 격자, 4 → 11m */
export function geoQuantize(lat: number, lng: number, precision = 3): string {
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
}
