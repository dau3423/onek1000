// Supabase 클라이언트 — 서버 사이드 전용 (service_role)
// 클라이언트(브라우저)에서는 NEXT_PUBLIC_SUPABASE_ANON_KEY를 사용해야 하지만
// 우리 앱은 모든 DB 접근을 API Routes로 거치므로 서버 전용 패턴 유지.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _server: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_server) return _server;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  _server = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'onek-server' } },
  });
  return _server;
}

let _fresh: SupabaseClient | null = null;

/**
 * 항상 신선한 읽기 전용 클라이언트 — 내부 fetch에 cache:'no-store'를 강제한다.
 * Next.js가 supabase-js의 fetch를 데이터 캐시에 가두어(force-dynamic/noStore로도 안 풀리는 사례)
 * 값이 바뀌어도 옛 결과가 반환되는 문제를 원천 차단한다(예: 활성 공지 조회).
 */
export function getSupabaseFresh(): SupabaseClient {
  if (_fresh) return _fresh;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  _fresh = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { 'X-Client-Info': 'onek-server-fresh' },
      // 모든 요청을 no-store로 → Next 데이터 캐시 우회(항상 DB 최신값).
      fetch: (input, init) => fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
    },
  });
  return _fresh;
}

/** 환경변수가 있을 때만 true. 알파 단계 전에는 mock으로 폴백. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
